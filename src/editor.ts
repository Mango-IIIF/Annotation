import { DEFAULT_CONFIG, DEFAULT_STYLE, OSD_EVENTS } from './defaults';
import {
  boundsFor,
  orientedRectCorners,
  pointsFor,
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
import { AnnotationStore, type SetAnnotationsOptions } from './store';
import type { AnnotationChange, ChangeOperation } from './history';
import {
  angleOf,
  rotateShape,
  shapeCenter,
  signedAngle,
  snapAngle,
  snapAngleWithCardinals,
  transformedBounds,
  translateShape,
} from './transform';
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
    }
  | {
      kind: 'rotate';
      id: string;
      original: ShapeData;
      /** Shape centre in image space, the pivot unless the host overrides it. */
      pivot: Point;
      /** Pointer angle when the gesture began, so rotation is relative. */
      startAngle: number;
      /** The shape's angle when the gesture began. */
      originalAngle: number;
    };

type Hit =
  | { kind: 'shape'; annotation: ShapeData }
  | { kind: 'handle'; annotation: ShapeData; handle: string; vertexIndex?: number };

const CLASS_NAME = 'mango-annotation-editor';

const gestureOperation = (drag: DragState): ChangeOperation => {
  switch (drag.kind) {
    case 'move':
      return 'move';
    case 'resize-rect':
      return 'resize';
    case 'vertex':
      return 'vertex';
    case 'rotate':
      return 'rotate';
    default:
      return 'draw';
  }
};

export class OSDAnnotationEditor {
  private viewer: OSDLikeViewer;
  private canvasSize: CanvasSize;
  private mode: CanonicalEditorMode;
  private store: AnnotationStore;
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
  private renderScheduled = false;
  private suspendDepth = 0;
  private frameHandle: number | null = null;
  private containerPosition: string | null = null;
  private keyboardTarget: Window | HTMLElement;
  private removeHandlers: Array<() => void> = [];
  private callbacks: Pick<
    OSDAnnotationEditorOptions,
    | 'onSelectionChanged'
    | 'onAnnotationCreated'
    | 'onAnnotationUpdated'
    | 'onAnnotationDeleted'
    | 'onModeChanged'
    | 'onAnnotationChanged'
  >;

  constructor(options: OSDAnnotationEditorOptions) {
    this.viewer = options.viewer;
    this.canvasSize = options.canvasSize;
    this.mode = normalizeMode(options.mode ?? 'select');
    this.store = new AnnotationStore({
      ...(options.annotations ? { annotations: options.annotations } : {}),
      selectedId: options.selectedId ?? null,
      ...(options.historyLimit === undefined ? {} : { historyLimit: options.historyLimit }),
      ...(options.policy ? { policy: options.policy } : {}),
      onChange: (changes) => {
        for (const change of changes) this.emitChange(change);
        this.renderUnlessSuspended();
      },
      onSelectionChanged: (id) => {
        this.callbacks.onSelectionChanged?.(id);
        this.renderUnlessSuspended();
      },
      ...(options.onHistoryChanged ? { onHistoryChanged: options.onHistoryChanged } : {}),
    });
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
      onAnnotationChanged: options.onAnnotationChanged,
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

  /**
   * Replaces or merges the collection.
   *
   * The history policy defaults to `reset`, because the common caller is a host
   * syncing a changed document, and preserved history would then point at
   * shapes that no longer exist. Pass `preserve` for an idempotent sync.
   */
  setAnnotations(annotations: ShapeData[], options: SetAnnotationsOptions = {}) {
    this.store.setAll(annotations, options);
    this.renderUnlessSuspended();
  }

  /** Adds one annotation. Throws on a duplicate id. */
  addAnnotation(annotation: ShapeData): ShapeData {
    return this.store.add(annotation);
  }

  /** Updates one annotation, returning its previous value. */
  updateAnnotation(annotation: ShapeData): ShapeData | undefined {
    return this.store.update(annotation);
  }

  /** Removes one annotation, returning it. */
  removeAnnotation(id: string): ShapeData | undefined {
    return this.store.remove(id);
  }

  /** Runs several mutations as a single undoable step. */
  batch<T>(run: () => T): T {
    this.suspendDepth += 1;
    try {
      return this.store.batch('batch', run);
    } finally {
      this.suspendDepth -= 1;
      this.renderUnlessSuspended();
    }
  }

  get canUndo(): boolean {
    return this.store.canUndo;
  }

  get canRedo(): boolean {
    return this.store.canRedo;
  }

  undo(): boolean {
    return this.store.undo();
  }

  redo(): boolean {
    return this.store.redo();
  }

  clearHistory(): void {
    this.store.clearHistory();
  }

  getAnnotations() {
    return this.store.all();
  }

  /** One annotation by id, without copying the whole collection. */
  getAnnotation(id: string): ShapeData | undefined {
    return this.store.get(id);
  }

  getSelectedId(): string | null {
    return this.store.selectedId;
  }

  select(id: string | null) {
    this.store.select(id);
  }

  delete(id = this.store.selectedId) {
    if (!id) return;
    if (!this.store.canDelete(id)) return;
    this.store.remove(id, { operation: 'programmatic' });
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

  /**
   * Renders now, unless a batch is open.
   *
   * A mutation a host made deliberately should be on screen before the call
   * returns — deferring it means a host that mutates and then measures reads
   * stale geometry. Only the viewport event stream, which fires every frame,
   * is worth coalescing.
   */
  private renderUnlessSuspended() {
    if (this.suspendDepth > 0 || this.destroyed) return;
    this.render();
  }

  /**
   * Coalesces render requests into one per animation frame.
   *
   * OpenSeadragon emits `animation` on every frame of a pan, and a batch
   * mutation emits one change per shape. Rendering synchronously for each would
   * rebuild the overlay dozens of times for a single visible update.
   */
  private scheduleRender() {
    if (this.destroyed || this.renderScheduled) return;
    this.renderScheduled = true;

    const run = () => {
      this.renderScheduled = false;
      this.frameHandle = null;
      this.render();
    };

    if (typeof requestAnimationFrame === 'function') {
      this.frameHandle = requestAnimationFrame(run);
    } else {
      // No animation frames in jsdom or a worker; stay synchronous there.
      this.renderScheduled = false;
      this.render();
    }
  }

  /** Computes the rotated shape for the current pointer position. */
  private rotatedFromPointer(
    drag: Extract<DragState, { kind: 'rotate' }>,
    point: Point,
    event: PointerEvent | KeyboardEvent,
  ): ShapeData {
    const rotation = this.config.rotation;
    const pointerAngle = angleOf(drag.pivot, point);
    let delta = signedAngle(pointerAngle - drag.startAngle);

    const modifier = this.isSnapModifierHeld(event);
    const snapping = rotation.snapByDefault ? !modifier : modifier;
    if (snapping) {
      const target = drag.originalAngle + delta;
      const snapped = snapAngleWithCardinals(
        target,
        rotation.snapIncrement ?? 15,
        rotation.cardinalTolerance ?? 4,
      );
      delta = snapped - drag.originalAngle;
    }

    return rotateShape(drag.original, delta, drag.pivot) as ShapeData;
  }

  private isSnapModifierHeld(event: PointerEvent | KeyboardEvent): boolean {
    switch (this.config.rotation.snapModifier) {
      case 'alt':
        return event.altKey;
      case 'ctrl':
        return event.ctrlKey;
      case 'meta':
        return event.metaKey;
      default:
        return event.shiftKey;
    }
  }

  private selectedAnnotation(): ShapeData | undefined {
    const id = this.store.selectedId;
    return id ? this.store.get(id) : undefined;
  }

  /**
   * Fans a store change out to the callbacks.
   *
   * The three original callbacks are kept for compatibility and only fire for
   * committed changes; `onAnnotationChanged` carries everything including
   * previews, distinguished by `transient`.
   */
  private emitChange(change: AnnotationChange): void {
    this.callbacks.onAnnotationChanged?.(change);
    if (change.transient) return;

    if (change.kind === 'create' && change.after) {
      this.callbacks.onAnnotationCreated?.(change.after);
    } else if (change.kind === 'update' && change.after) {
      this.callbacks.onAnnotationUpdated?.(change.after);
    } else if (change.kind === 'delete') {
      this.callbacks.onAnnotationDeleted?.(change.id);
    }
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
        if (hit.handle === 'rotate') {
          if (!this.store.canRotate(hit.annotation.id)) return;
          const pivot = shapeCenter(hit.annotation);
          this.store.beginTransaction('rotate');
          this.drag = {
            kind: 'rotate',
            id: hit.annotation.id,
            original: structuredClone(hit.annotation),
            pivot,
            startAngle: angleOf(pivot, point),
            originalAngle:
              hit.annotation.type === 'oriented-rect' ? hit.annotation.geometry.angle : 0,
          };
          return;
        }
        if (!this.store.canEdit(hit.annotation.id)) return;
        if (hit.handle === 'vertex' && hit.vertexIndex != null) {
          this.store.beginTransaction('vertex');
          this.drag = {
            kind: 'vertex',
            id: hit.annotation.id,
            vertexIndex: hit.vertexIndex,
            original: structuredClone(hit.annotation),
          };
          return;
        }
        if (hit.annotation.type === 'rect') {
          this.store.beginTransaction('resize');
          this.drag = {
            kind: 'resize-rect',
            id: hit.annotation.id,
            handle: hit.handle,
            original: structuredClone(hit.annotation),
          };
        }
        return;
      }
      if (!this.store.canEdit(hit.annotation.id)) return;
      this.store.beginTransaction('move');
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
      // translateShape, not translateAnnotation: the whole shape is clamped as
      // a rigid body, so dragging against an edge cannot distort it.
      this.replaceAnnotation(
        translateShape(this.drag.original, delta, this.canvasSize) as ShapeData,
        'move',
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
        'resize',
      );
      return;
    }

    if (this.drag.kind === 'rotate') {
      this.replaceAnnotation(this.rotatedFromPointer(this.drag, point, event), 'rotate');
      return;
    }

    this.replaceAnnotation(
      updateVertex(this.drag.original, this.drag.vertexIndex, point, this.canvasSize),
      'vertex',
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

    this.commitGesture(drag);
  };

  /**
   * Turns an in-flight gesture into one committed change.
   *
   * The previews were transient, so nothing has entered history yet. This
   * replays the final geometry as a single non-transient update inside the open
   * transaction, then closes it.
   */
  private commitGesture(drag: Exclude<DragState, { kind: 'draw' }>) {
    const updated = this.store.get(drag.id);
    if (!updated) {
      this.store.abortTransaction();
      return;
    }

    const changed = JSON.stringify(updated) !== JSON.stringify(drag.original);
    if (!changed) {
      this.store.abortTransaction();
      return;
    }

    this.store.commitCurrent(drag.id, drag.original, gestureOperation(drag));
    this.store.commitTransaction();
  }

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
      } else if (this.store.selectedId) {
        event.preventDefault();
        this.select(null);
      }
      return;
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && this.store.selectedId) {
      event.preventDefault();
      this.delete(this.store.selectedId);
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
    this.store.add(annotation, { operation: 'draw' });
    this.store.select(annotation.id);
  }

  /**
   * Applies an in-flight geometry change.
   *
   * Marked transient so it reaches the host as a preview but never enters
   * history: a drag emitting a hundred samples must still be one undo step.
   */
  private replaceAnnotation(annotation: ShapeData, operation: ChangeOperation) {
    this.store.update(annotation, { operation, transient: true });
  }

  private cancelDraft() {
    if (this.drag && this.drag.kind !== 'draw') this.store.abortTransaction();
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

    for (const annotation of this.store.visible()) {
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
    const active = annotation.id === this.store.selectedId;
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
    } else if (annotation.type === 'oriented-rect') {
      const points = orientedRectCorners(annotation.geometry).map((point) => this.toElement(point));
      element = createSvgElement('polygon');
      element.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '));
      applyShapeStyle(element, style, { active, fill: true });
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
    const selected = this.selectedAnnotation();
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
          : selected.type === 'oriented-rect'
            ? orientedRectCorners(selected.geometry)
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
    const candidates = this.store.visible();
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const annotation = candidates[index] as ShapeData;
      if (this.containsPoint(annotation, point)) return { kind: 'shape', annotation };
    }
    return null;
  }

  private hitHandle(point: Point): Hit | null {
    const selected = this.selectedAnnotation();
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
          : selected.type === 'oriented-rect'
            ? orientedRectCorners(selected.geometry)
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
    return this.pointInPolygon(point, pointsFor(annotation));
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
