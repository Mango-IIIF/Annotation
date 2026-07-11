import { DEFAULT_CONFIG, DEFAULT_STYLE, OSD_EVENTS } from './defaults';
import {
  boundsFor,
  constrainPoint,
  distance,
  normalizeRect,
  resizeRect,
  simplifyPoints,
  snapLinePoint,
  translateAnnotation,
  updateVertex,
} from './geometry';
import { modeToShape, normalizeMode } from './modes';
import {
  applyShapeStyle,
  createSvgElement,
  elementToPoint,
  pointToElement,
  resolveStyle,
} from './render';
import type {
  AnnotationStyle,
  AnnotationTheme,
  CanonicalEditorMode,
  CanvasSize,
  EditorConfig,
  EditorMode,
  OSDAnnotationEditorOptions,
  OSDLikeViewer,
  Point,
  ShapeData,
} from './types';

type DragState =
  | {
      kind: 'draw';
      start: Point;
      points: Point[];
    }
  | {
      kind: 'move';
      id: string;
      start: Point;
      original: ShapeData;
    }
  | {
      kind: 'resize-rect';
      id: string;
      handle: string;
      original: Extract<ShapeData, { type: 'rect' }>;
    }
  | {
      kind: 'vertex';
      id: string;
      vertexIndex: number;
      original: ShapeData;
    };

type Hit =
  | { kind: 'shape'; annotation: ShapeData }
  | { kind: 'handle'; annotation: ShapeData; handle: string; vertexIndex?: number };

const CLASS_NAME = 'mango-annotation-editor';

export class OSDAnnotationEditor {
  private viewer: OSDLikeViewer;
  private canvasSize: CanvasSize;
  private mode: CanonicalEditorMode;
  private annotations: ShapeData[];
  private selectedId: string | null;
  private currentLayer?: string;
  private style: Partial<AnnotationStyle>;
  private theme: AnnotationTheme;
  private config: Required<Omit<EditorConfig, 'shapes' | 'minShapeSize'>> & {
    minShapeSize: { width: number; height: number };
    shapes: NonNullable<EditorConfig['shapes']>;
  };
  private root: HTMLDivElement;
  private svg: SVGSVGElement;
  private draftLayer: SVGGElement;
  private shapeLayer: SVGGElement;
  private handleLayer: SVGGElement;
  private drag: DragState | null = null;
  private polygonDraft: Point[] = [];
  private lastPolygonClick: { point: Point; time: number } | null = null;
  private destroyed = false;
  private keyboardTarget: Window | HTMLElement;
  private removeHandlers: Array<() => void> = [];
  private callbacks: Pick<
    OSDAnnotationEditorOptions,
    | 'onSelectionChanged'
    | 'onAnnotationCreated'
    | 'onAnnotationUpdated'
    | 'onAnnotationDeleted'
    | 'onModeChanged'
  >;

  constructor(options: OSDAnnotationEditorOptions) {
    this.viewer = options.viewer;
    this.canvasSize = options.canvasSize;
    this.mode = normalizeMode(options.mode ?? 'select');
    this.annotations = [...(options.annotations ?? [])];
    this.selectedId = options.selectedId ?? null;
    this.currentLayer = options.currentLayer;
    this.style = { ...DEFAULT_STYLE, ...(options.style ?? {}) };
    this.theme = options.theme ?? {};
    this.config = {
      ...DEFAULT_CONFIG,
      ...(options.config ?? {}),
      minShapeSize: {
        ...DEFAULT_CONFIG.minShapeSize,
        ...(options.config?.minShapeSize ?? {}),
      },
      shapes: {
        rect: { ...DEFAULT_CONFIG.shapes.rect, ...(options.config?.shapes?.rect ?? {}) },
        line: { ...DEFAULT_CONFIG.shapes.line, ...(options.config?.shapes?.line ?? {}) },
        freehand: {
          ...DEFAULT_CONFIG.shapes.freehand,
          ...(options.config?.shapes?.freehand ?? {}),
        },
      },
    };
    this.callbacks = {
      onSelectionChanged: options.onSelectionChanged,
      onAnnotationCreated: options.onAnnotationCreated,
      onAnnotationUpdated: options.onAnnotationUpdated,
      onAnnotationDeleted: options.onAnnotationDeleted,
      onModeChanged: options.onModeChanged,
    };
    this.keyboardTarget = options.keyboardTarget ?? window;
    this.root = document.createElement('div');
    this.root.className = CLASS_NAME;
    this.root.style.position = 'absolute';
    this.root.style.inset = '0';
    this.root.style.zIndex = '5';
    this.root.style.pointerEvents = 'none';

    this.svg = createSvgElement('svg');
    this.svg.setAttribute('class', `${CLASS_NAME}__svg`);
    this.svg.style.position = 'absolute';
    this.svg.style.inset = '0';
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.overflow = 'visible';
    this.svg.style.pointerEvents = 'auto';
    this.svg.setAttribute('role', 'application');
    this.svg.setAttribute('aria-label', 'Annotation editor');

    this.shapeLayer = createSvgElement('g');
    this.draftLayer = createSvgElement('g');
    this.handleLayer = createSvgElement('g');
    this.svg.append(this.shapeLayer, this.draftLayer, this.handleLayer);
    this.root.append(this.svg);
    this.mount();
    this.bindEvents();
    this.render();
  }

  setMode(mode: EditorMode) {
    const next = normalizeMode(mode);
    if (this.mode === next) return;
    this.mode = next;
    this.cancelDraft();
    this.callbacks.onModeChanged?.(this.mode);
    this.render();
  }

  getMode() {
    return this.mode;
  }

  setAnnotations(annotations: ShapeData[]) {
    this.annotations = [...annotations];
    if (this.selectedId && !this.annotations.some((item) => item.id === this.selectedId)) {
      this.selectedId = null;
    }
    this.render();
  }

  getAnnotations() {
    return [...this.annotations];
  }

  select(id: string | null) {
    const next = id && this.annotations.some((item) => item.id === id) ? id : null;
    if (this.selectedId === next) return;
    this.selectedId = next;
    this.callbacks.onSelectionChanged?.(next);
    this.render();
  }

  delete(id = this.selectedId) {
    if (!id) return;
    this.annotations = this.annotations.filter((item) => item.id !== id);
    if (this.selectedId === id) this.select(null);
    this.callbacks.onAnnotationDeleted?.(id);
    this.render();
  }

  updateCanvasSize(canvasSize: CanvasSize) {
    this.canvasSize = canvasSize;
    this.render();
  }

  updateTheme(theme: AnnotationTheme) {
    this.theme = {
      defaults: { ...this.theme.defaults, ...theme.defaults },
      layers: { ...this.theme.layers, ...theme.layers },
    };
    this.render();
  }

  updateLayerStyle(layer: string, style: Partial<AnnotationStyle>) {
    this.theme = {
      ...this.theme,
      layers: {
        ...this.theme.layers,
        [layer]: {
          ...(this.theme.layers?.[layer] ?? {}),
          ...style,
        },
      },
    };
    this.render();
  }

  updateConfig(config: EditorConfig) {
    this.config = {
      ...this.config,
      ...config,
      minShapeSize: { ...this.config.minShapeSize, ...(config.minShapeSize ?? {}) },
      shapes: {
        rect: { ...this.config.shapes.rect, ...(config.shapes?.rect ?? {}) },
        line: { ...this.config.shapes.line, ...(config.shapes?.line ?? {}) },
        freehand: { ...this.config.shapes.freehand, ...(config.shapes?.freehand ?? {}) },
      },
    };
    this.render();
  }

  setCurrentLayer(layer: string | undefined) {
    this.currentLayer = layer;
    this.render();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const remove of this.removeHandlers) remove();
    this.removeHandlers = [];
    this.root.remove();
  }

  private mount() {
    const container = this.viewer.container;
    const position = getComputedStyle(container).position;
    if (position === 'static') {
      container.style.position = 'relative';
    }
    container.append(this.root);
  }

  private bindEvents() {
    this.listen(this.svg, 'pointerdown', this.onPointerDown);
    this.listen(this.svg, 'pointermove', this.onPointerMove);
    this.listen(this.svg, 'pointerup', this.onPointerUp);
    this.listen(this.svg, 'pointerleave', this.onPointerUp);
    this.listen(this.svg, 'dblclick', this.onDoubleClick);
    this.listen(this.svg, 'click', this.onClick);
    this.listen(this.viewer.container, 'pointerdown', this.onContainerPointerDown);
    this.listenEvent(this.keyboardTarget, 'keydown', this.onKeyDown as EventListener);

    for (const eventName of OSD_EVENTS) {
      const handler = () => this.render();
      this.viewer.addHandler?.(eventName, handler);
      this.removeHandlers.push(() => this.viewer.removeHandler?.(eventName, handler));
    }
    this.listen(window, 'resize', () => this.render());
  }

  private listen<K extends keyof WindowEventMap>(
    target: Window,
    eventName: K,
    handler: (event: WindowEventMap[K]) => void,
  ): void;
  private listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | SVGSVGElement,
    eventName: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ): void;
  private listen(
    target: Window | HTMLElement | SVGSVGElement,
    eventName: string,
    handler: EventListener,
  ) {
    this.listenEvent(target, eventName, handler);
  }

  private listenEvent(
    target: Window | HTMLElement | SVGSVGElement,
    eventName: string,
    handler: EventListener,
  ) {
    target.addEventListener(eventName, handler);
    this.removeHandlers.push(() => target.removeEventListener(eventName, handler));
  }

  private onPointerDown = (event: PointerEvent) => {
    if (this.mode === 'none') return;
    const point = this.eventToCanvasPoint(event);
    const shape = modeToShape(this.mode);
    if (!shape || this.mode === 'select') {
      const hit = this.hitTest(point);
      if (!hit) {
        this.select(null);
        return;
      }
      this.consumePointerEvent(event);
      this.svg.setPointerCapture?.(event.pointerId);
      this.select(hit.annotation.id);
      if (hit.kind === 'handle') {
        if (hit.handle === 'vertex' && hit.vertexIndex != null) {
          this.drag = {
            kind: 'vertex',
            id: hit.annotation.id,
            vertexIndex: hit.vertexIndex,
            original: structuredClone(hit.annotation),
          };
          return;
        }
        if (hit.annotation.type === 'rect') {
          this.drag = {
            kind: 'resize-rect',
            id: hit.annotation.id,
            handle: hit.handle,
            original: structuredClone(hit.annotation),
          };
        }
        return;
      }
      this.drag = {
        kind: 'move',
        id: hit.annotation.id,
        start: point,
        original: structuredClone(hit.annotation),
      };
      return;
    }

    this.consumeDrawingPointerEvent(event);
    this.svg.setPointerCapture?.(event.pointerId);
    if (shape === 'point') {
      this.createAnnotation({
        id: this.createId(),
        type: 'point',
        geometry: constrainPoint(point, this.canvasSize),
        layer: this.currentLayer,
      });
      return;
    }
    if (shape === 'polygon') {
      if (this.isPolygonDoubleClick(point, event)) {
        this.commitPolygonDraft();
        return;
      }
      if (event.detail >= 2) {
        if (this.polygonDraft.length >= 3) {
          this.commitPolygonDraft();
        }
        return;
      }
      if (
        this.polygonDraft.length >= 3 &&
        distance(
          pointToElement(this.viewer, this.polygonDraft[0], this.canvasSize),
          pointToElement(this.viewer, point, this.canvasSize),
        ) <= this.config.polygonCloseTolerance
      ) {
        this.commitPolygonDraft();
        return;
      }
      this.polygonDraft = [...this.polygonDraft, constrainPoint(point, this.canvasSize)];
      this.lastPolygonClick = {
        point: constrainPoint(point, this.canvasSize),
        time: event.timeStamp,
      };
      this.render();
      return;
    }
    this.drag = {
      kind: 'draw',
      start: constrainPoint(point, this.canvasSize),
      points: [constrainPoint(point, this.canvasSize)],
    };
    this.render();
  };

  private onPointerMove = (event: PointerEvent) => {
    const point = this.eventToCanvasPoint(event);
    if (!this.drag) {
      if (modeToShape(this.mode)) {
        this.consumeDrawingPointerEvent(event);
      }
      this.svg.style.cursor = this.cursorFor(point);
      if (this.mode === 'draw-polygon' && this.polygonDraft.length > 0) {
        this.renderDraft(point);
      }
      return;
    }
    this.consumePointerEvent(event);

    if (this.drag.kind === 'draw') {
      const nextPoint =
        this.mode === 'draw-line' && event.shiftKey
          ? snapLinePoint(this.drag.start, point)
          : point;
      this.drag.points =
        this.mode === 'draw-freehand'
          ? [...this.drag.points, constrainPoint(nextPoint, this.canvasSize)]
          : [this.drag.start, constrainPoint(nextPoint, this.canvasSize)];
      this.render();
      return;
    }

    if (this.drag.kind === 'move') {
      const delta = {
        x: point.x - this.drag.start.x,
        y: point.y - this.drag.start.y,
      };
      this.replaceAnnotation(
        translateAnnotation(this.drag.original, delta, this.canvasSize),
        false,
      );
      return;
    }

    if (this.drag.kind === 'resize-rect') {
      this.replaceAnnotation(
        resizeRect(
          this.drag.original,
          this.drag.handle,
          point,
          this.canvasSize,
          this.config.minShapeSize,
          event.shiftKey,
        ),
        false,
      );
      return;
    }

    this.replaceAnnotation(
      updateVertex(this.drag.original, this.drag.vertexIndex, point, this.canvasSize),
      false,
    );
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.drag) {
      if (modeToShape(this.mode)) {
        this.consumeDrawingPointerEvent(event);
        this.svg.releasePointerCapture?.(event.pointerId);
      }
      return;
    }
    this.consumePointerEvent(event);
    this.svg.releasePointerCapture?.(event.pointerId);
    const drag = this.drag;
    this.drag = null;

    if (drag.kind === 'draw') {
      this.commitDraw(drag, event.shiftKey);
      return;
    }

    const updated = this.annotations.find((item) => item.id === drag.id);
    if (updated) this.callbacks.onAnnotationUpdated?.(updated);
  };

  private onDoubleClick = (event: MouseEvent) => {
    if (this.mode !== 'draw-polygon') return;
    event.preventDefault();
    event.stopPropagation();
    const points = [...this.polygonDraft];
    if (points.length >= 3) {
      points.pop();
    }
    if (points.length >= 3) {
      this.commitPolygonDraft(points);
      return;
    }
    this.cancelDraft();
  };

  private onClick = (event: MouseEvent) => {
    if (modeToShape(this.mode)) {
      if (this.mode !== 'draw-polygon') {
        event.preventDefault();
      }
      event.stopPropagation();
    }
  };

  private onContainerPointerDown = (event: PointerEvent) => {
    if (this.mode !== 'select') return;
    if (this.root.contains(event.target as Node)) return;
    this.select(null);
  };

  private onKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable
    ) {
      return;
    }
    if (event.key === 'Escape') {
      if (this.drag || this.polygonDraft.length > 0) {
        event.preventDefault();
        this.cancelDraft();
      } else if (this.selectedId) {
        event.preventDefault();
        this.select(null);
      }
      return;
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && this.selectedId) {
      event.preventDefault();
      this.delete(this.selectedId);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      if (this.mode === 'draw-polygon' && this.polygonDraft.length > 0) {
        event.preventDefault();
        this.polygonDraft = this.polygonDraft.slice(0, -1);
        this.render();
      }
      return;
    }
    if (event.key === 'Enter' && this.mode === 'draw-polygon' && this.polygonDraft.length >= 3) {
      event.preventDefault();
      this.commitPolygonDraft();
    }
  };

  private commitDraw(drag: Extract<DragState, { kind: 'draw' }>, shiftKey: boolean) {
    const [start, rawEnd] = drag.points;
    const end = this.mode === 'draw-line' && shiftKey ? snapLinePoint(start, rawEnd) : rawEnd;
    if (this.mode === 'draw-rect') {
      const rect = normalizeRect({
        x: start.x,
        y: start.y,
        w: end.x - start.x,
        h: end.y - start.y,
      });
      if (rect.w < this.config.minShapeSize.width || rect.h < this.config.minShapeSize.height) {
        this.render();
        return;
      }
      this.createAnnotation({
        id: this.createId(),
        type: 'rect',
        geometry: rect,
        layer: this.currentLayer,
      });
      return;
    }
    if (this.mode === 'draw-line') {
      if (distance(start, end) < this.config.minShapeSize.width) {
        this.render();
        return;
      }
      this.createAnnotation({
        id: this.createId(),
        type: 'line',
        geometry: { start, end },
        layer: this.currentLayer,
      });
      return;
    }
    if (this.mode === 'draw-freehand') {
      const points = simplifyPoints(
        drag.points,
        this.config.shapes.freehand?.simplifyTolerance ?? 0,
      );
      if (points.length < 2) {
        this.render();
        return;
      }
      this.createAnnotation({
        id: this.createId(),
        type: 'freehand',
        geometry: { points },
        layer: this.currentLayer,
      });
    }
  }

  private commitPolygonDraft(points = this.polygonDraft) {
    if (points.length < 3) return;
    this.createAnnotation({
      id: this.createId(),
      type: 'polygon',
      geometry: { points },
      layer: this.currentLayer,
    });
    this.polygonDraft = [];
    this.lastPolygonClick = null;
  }

  private createAnnotation(annotation: ShapeData) {
    this.annotations = [...this.annotations, annotation];
    this.select(annotation.id);
    this.callbacks.onAnnotationCreated?.(annotation);
    this.render();
  }

  private replaceAnnotation(annotation: ShapeData, emit: boolean) {
    this.annotations = this.annotations.map((item) =>
      item.id === annotation.id ? annotation : item,
    );
    if (emit) this.callbacks.onAnnotationUpdated?.(annotation);
    this.render();
  }

  private cancelDraft() {
    this.drag = null;
    this.polygonDraft = [];
    this.lastPolygonClick = null;
    this.render();
  }

  private isPolygonDoubleClick(point: Point, event: PointerEvent) {
    if (!this.lastPolygonClick || this.polygonDraft.length < 3) return false;
    const elapsed = event.timeStamp - this.lastPolygonClick.time;
    if (elapsed < 0 || elapsed > this.config.polygonDoubleClickDelay) return false;
    return (
      distance(
        pointToElement(this.viewer, point, this.canvasSize),
        pointToElement(this.viewer, this.lastPolygonClick.point, this.canvasSize),
      ) <= this.config.polygonDoubleClickTolerance
    );
  }

  private eventToCanvasPoint(event: PointerEvent | MouseEvent): Point {
    const rect = this.viewer.container.getBoundingClientRect();
    return constrainPoint(
      elementToPoint(
        this.viewer,
        {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
        this.canvasSize,
      ),
      this.canvasSize,
    );
  }

  private toElement(point: Point) {
    return pointToElement(this.viewer, point, this.canvasSize);
  }

  private render() {
    if (this.destroyed) return;
    const rect = this.viewer.container.getBoundingClientRect();
    this.svg.style.pointerEvents = modeToShape(this.mode) ? 'auto' : 'none';
    this.svg.setAttribute('width', String(rect.width));
    this.svg.setAttribute('height', String(rect.height));
    this.svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    this.shapeLayer.replaceChildren();
    this.draftLayer.replaceChildren();
    this.handleLayer.replaceChildren();

    for (const annotation of this.annotations) {
      this.renderAnnotation(annotation);
    }
    this.renderHandles();
    if (this.drag?.kind === 'draw') {
      this.renderDraft();
    }
    if (this.polygonDraft.length > 0) {
      this.renderPolygonDraft();
    }
  }

  private renderAnnotation(annotation: ShapeData) {
    const active = annotation.id === this.selectedId;
    const style = resolveStyle(annotation, this.theme, this.style) as AnnotationStyle;
    let element: SVGElement;
    if (annotation.type === 'rect') {
      const rect = normalizeRect(annotation.geometry);
      const start = this.toElement({ x: rect.x, y: rect.y });
      const end = this.toElement({ x: rect.x + rect.w, y: rect.y + rect.h });
      element = createSvgElement('rect');
      element.setAttribute('x', String(Math.min(start.x, end.x)));
      element.setAttribute('y', String(Math.min(start.y, end.y)));
      element.setAttribute('width', String(Math.abs(end.x - start.x)));
      element.setAttribute('height', String(Math.abs(end.y - start.y)));
      const radius = this.config.shapes.rect?.borderRadius ?? 0;
      element.setAttribute('rx', String(radius));
      element.setAttribute('ry', String(radius));
      applyShapeStyle(element, style, { active, fill: true });
    } else if (annotation.type === 'point') {
      const point = this.toElement(annotation.geometry);
      element = createSvgElement('circle');
      element.setAttribute('cx', String(point.x));
      element.setAttribute('cy', String(point.y));
      element.setAttribute('r', '6');
      applyShapeStyle(element, style, { active, fill: true });
    } else if (annotation.type === 'line') {
      const start = this.toElement(annotation.geometry.start);
      const end = this.toElement(annotation.geometry.end);
      element = createSvgElement('line');
      element.setAttribute('x1', String(start.x));
      element.setAttribute('y1', String(start.y));
      element.setAttribute('x2', String(end.x));
      element.setAttribute('y2', String(end.y));
      element.setAttribute('stroke-linecap', this.config.shapes.line?.lineCap ?? 'round');
      applyShapeStyle(element, style, { active, fill: false });
    } else {
      const points = annotation.geometry.points.map((point) => this.toElement(point));
      element = createSvgElement(annotation.type === 'polygon' ? 'polygon' : 'polyline');
      element.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '));
      element.setAttribute('stroke-linecap', this.config.shapes.line?.lineCap ?? 'round');
      element.setAttribute('stroke-linejoin', this.config.shapes.line?.lineJoin ?? 'round');
      applyShapeStyle(element, style, { active, fill: annotation.type === 'polygon' });
    }
    element.dataset.annotationId = annotation.id;
    element.style.pointerEvents = 'visiblePainted';
    element.style.cursor = this.mode === 'select' ? 'pointer' : 'crosshair';
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', annotation.label || annotation.text || 'Annotation');
    this.shapeLayer.append(element);

    if (annotation.label) {
      this.renderLabel(annotation);
    }
  }

  private renderLabel(annotation: ShapeData) {
    const bounds = boundsFor(annotation);
    const point = this.toElement({ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h });
    const text = createSvgElement('text');
    text.textContent = annotation.label ?? '';
    text.setAttribute('x', String(point.x));
    text.setAttribute('y', String(point.y + 14));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '11');
    text.setAttribute('fill', '#f8fafc');
    text.setAttribute('paint-order', 'stroke');
    text.setAttribute('stroke', 'rgba(15, 23, 42, 0.9)');
    text.setAttribute('stroke-width', '3');
    text.style.pointerEvents = 'none';
    this.shapeLayer.append(text);
  }

  private renderHandles() {
    const selected = this.annotations.find((item) => item.id === this.selectedId);
    if (!selected || this.mode !== 'select') return;
    const size = this.config.handleSize;
    if (selected.type === 'rect') {
      const rect = normalizeRect(selected.geometry);
      const handles: Array<[string, Point]> = [
        ['nw', { x: rect.x, y: rect.y }],
        ['n', { x: rect.x + rect.w / 2, y: rect.y }],
        ['ne', { x: rect.x + rect.w, y: rect.y }],
        ['e', { x: rect.x + rect.w, y: rect.y + rect.h / 2 }],
        ['se', { x: rect.x + rect.w, y: rect.y + rect.h }],
        ['s', { x: rect.x + rect.w / 2, y: rect.y + rect.h }],
        ['sw', { x: rect.x, y: rect.y + rect.h }],
        ['w', { x: rect.x, y: rect.y + rect.h / 2 }],
      ];
      for (const [handle, point] of handles) {
        this.renderHandle(point, handle, selected.id, size);
      }
      return;
    }
    const points =
      selected.type === 'line'
        ? [selected.geometry.start, selected.geometry.end]
        : selected.type === 'point'
          ? [selected.geometry]
          : selected.geometry.points;
    points.forEach((point, index) =>
      this.renderHandle(point, 'vertex', selected.id, size, index),
    );
  }

  private renderHandle(
    point: Point,
    handle: string,
    id: string,
    size: number,
    vertexIndex?: number,
  ) {
    const projected = this.toElement(point);
    const element = createSvgElement('rect');
    element.setAttribute('x', String(projected.x - size / 2));
    element.setAttribute('y', String(projected.y - size / 2));
    element.setAttribute('width', String(size));
    element.setAttribute('height', String(size));
    element.setAttribute('rx', '2');
    element.setAttribute('fill', this.config.handleColor);
    element.setAttribute('stroke', this.config.handleStrokeColor);
    element.setAttribute('stroke-width', '1.5');
    element.setAttribute('vector-effect', 'non-scaling-stroke');
    element.dataset.annotationId = id;
    element.dataset.handle = handle;
    if (vertexIndex != null) element.dataset.vertexIndex = String(vertexIndex);
    element.style.pointerEvents = 'all';
    element.style.cursor = handle === 'vertex' ? 'move' : `${handle}-resize`;
    this.handleLayer.append(element);
  }

  private renderDraft(pointer?: Point) {
    this.draftLayer.replaceChildren();
    const style = this.currentLayerStyle();
    if (this.drag?.kind === 'draw') {
      const [start, end] = this.drag.points;
      if (!end) return;
      if (this.mode === 'draw-rect') {
        const rect = normalizeRect({
          x: start.x,
          y: start.y,
          w: end.x - start.x,
          h: end.y - start.y,
        });
        const a = this.toElement({ x: rect.x, y: rect.y });
        const b = this.toElement({ x: rect.x + rect.w, y: rect.y + rect.h });
        const element = createSvgElement('rect');
        element.setAttribute('x', String(Math.min(a.x, b.x)));
        element.setAttribute('y', String(Math.min(a.y, b.y)));
        element.setAttribute('width', String(Math.abs(b.x - a.x)));
        element.setAttribute('height', String(Math.abs(b.y - a.y)));
        applyShapeStyle(element, style, { fill: true });
        this.draftLayer.append(element);
      } else if (this.mode === 'draw-line') {
        const a = this.toElement(start);
        const b = this.toElement(end);
        const element = createSvgElement('line');
        element.setAttribute('x1', String(a.x));
        element.setAttribute('y1', String(a.y));
        element.setAttribute('x2', String(b.x));
        element.setAttribute('y2', String(b.y));
        applyShapeStyle(element, style, { fill: false });
        this.draftLayer.append(element);
      } else if (this.mode === 'draw-freehand') {
        const element = createSvgElement('polyline');
        element.setAttribute(
          'points',
          this.drag.points.map((point) => this.toElement(point)).map((p) => `${p.x},${p.y}`).join(' '),
        );
        applyShapeStyle(element, style, { fill: false });
        this.draftLayer.append(element);
      }
    }
    if (pointer) this.renderPolygonDraft(pointer);
  }

  private renderPolygonDraft(pointer?: Point) {
    const points = [...this.polygonDraft, ...(pointer ? [pointer] : [])];
    if (points.length === 0) return;
    const style = this.currentLayerStyle();
    const element = createSvgElement('polyline');
    element.setAttribute(
      'points',
      points.map((point) => this.toElement(point)).map((point) => `${point.x},${point.y}`).join(' '),
    );
    applyShapeStyle(element, style, { fill: false });
    this.draftLayer.append(element);
    for (const point of this.polygonDraft) {
      this.renderHandle(point, 'draft', 'draft', Math.max(6, this.config.handleSize - 2));
    }
  }

  private hitTest(point: Point): Hit | null {
    const handle = this.hitHandle(point);
    if (handle) return handle;
    for (let index = this.annotations.length - 1; index >= 0; index -= 1) {
      const annotation = this.annotations[index];
      if (this.containsPoint(annotation, point)) return { kind: 'shape', annotation };
    }
    return null;
  }

  private hitHandle(point: Point): Hit | null {
    const selected = this.annotations.find((item) => item.id === this.selectedId);
    if (!selected) return null;
    const tolerance = this.config.hitTolerance;
    if (selected.type === 'rect') {
      const rect = normalizeRect(selected.geometry);
      const handles: Array<[string, Point]> = [
        ['nw', { x: rect.x, y: rect.y }],
        ['n', { x: rect.x + rect.w / 2, y: rect.y }],
        ['ne', { x: rect.x + rect.w, y: rect.y }],
        ['e', { x: rect.x + rect.w, y: rect.y + rect.h / 2 }],
        ['se', { x: rect.x + rect.w, y: rect.y + rect.h }],
        ['s', { x: rect.x + rect.w / 2, y: rect.y + rect.h }],
        ['sw', { x: rect.x, y: rect.y + rect.h }],
        ['w', { x: rect.x, y: rect.y + rect.h / 2 }],
      ];
      for (const [name, handlePoint] of handles) {
        if (this.elementDistance(point, handlePoint) <= tolerance) {
          return { kind: 'handle', annotation: selected, handle: name };
        }
      }
      return null;
    }
    const points =
      selected.type === 'line'
        ? [selected.geometry.start, selected.geometry.end]
        : selected.type === 'point'
          ? [selected.geometry]
          : selected.geometry.points;
    for (let index = 0; index < points.length; index += 1) {
      if (this.elementDistance(point, points[index]) <= tolerance) {
        return {
          kind: 'handle',
          annotation: selected,
          handle: 'vertex',
          vertexIndex: index,
        };
      }
    }
    return null;
  }

  private containsPoint(annotation: ShapeData, point: Point) {
    const tolerance = this.config.hitTolerance;
    if (annotation.type === 'rect') {
      const rect = normalizeRect(annotation.geometry);
      return (
        point.x >= rect.x &&
        point.x <= rect.x + rect.w &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.h
      );
    }
    if (annotation.type === 'point') {
      return this.elementDistance(point, annotation.geometry) <= tolerance;
    }
    if (annotation.type === 'line') {
      return this.distanceToSegment(point, annotation.geometry.start, annotation.geometry.end) <= tolerance;
    }
    if (annotation.type === 'freehand') {
      return annotation.geometry.points.some((candidate, index, points) => {
        if (index === 0) return false;
        return this.distanceToSegment(point, points[index - 1], candidate) <= tolerance;
      });
    }
    return this.pointInPolygon(point, annotation.geometry.points);
  }

  private distanceToSegment(point: Point, start: Point, end: Point) {
    const p = this.toElement(point);
    const a = this.toElement(start);
    const b = this.toElement(end);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return distance(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
  }

  private elementDistance(a: Point, b: Point) {
    return distance(this.toElement(a), this.toElement(b));
  }

  private pointInPolygon(point: Point, polygon: Point[]) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const pi = polygon[i];
      const pj = polygon[j];
      const intersect =
        pi.y > point.y !== pj.y > point.y &&
        point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private cursorFor(point: Point) {
    if (this.mode !== 'select') {
      return this.mode === 'none' ? 'default' : 'crosshair';
    }
    const hit = this.hitTest(point);
    if (!hit) return 'default';
    if (hit.kind === 'shape') return 'move';
    if (hit.handle === 'vertex') return 'move';
    return `${hit.handle}-resize`;
  }

  private createId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return `anno-${crypto.randomUUID()}`;
    }
    return `anno-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private currentLayerStyle() {
    return resolveStyle(
      this.currentLayer
        ? {
            id: '__draft__',
            type: 'point',
            layer: this.currentLayer,
            geometry: { x: 0, y: 0 },
          }
        : null,
      this.theme,
      this.style,
    ) as AnnotationStyle;
  }

  private consumePointerEvent(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  private consumeDrawingPointerEvent(event: PointerEvent) {
    if (this.mode === 'draw-polygon') {
      event.stopPropagation();
      return;
    }
    this.consumePointerEvent(event);
  }
}
