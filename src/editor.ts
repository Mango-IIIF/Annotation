import { DEFAULT_CONFIG, DEFAULT_STYLE, OSD_EVENTS } from './defaults';
import {
  boundsFor,
  clamp,
  constrainDrawnRect,
  insertVertex,
  nearestSegment,
  pathLength,
  polygonArea,
  removeVertex,
  pointsFor,
  resizeHandlesFor,
  shapeRotation,
  constrainPoint,
  distance,
  normalizeRect,
  resizeRect,
  simplifyPoints,
  snapLinePoint,
  translateAnnotation,
  updateVertex,
} from './geometry';
import {
  hasAccurateProjection,
  matrixToTransform,
  projectionMatrix,
  type ProjectionMatrix,
} from './coordinates';
import { modeToShape, normalizeMode } from './modes';
import { AnnotationStore, type SetAnnotationsOptions } from './store';
import type { AnnotationChange, ChangeOperation } from './history';
import {
  angleOf,
  constrainShape,
  normalizeAngle,
  rotatePoint,
  rotateShape,
  shapeCenter,
  signedAngle,
  snapAngle,
  snapAngleWithCardinals,
  boundsOfPoints,
  toPolygonPoints,
  transformedBounds,
  translateShape,
} from './transform';
import {
  applyShapeStyle,
  createSvgElement,
  elementToPoint,
  pointToElement,
  resolveStyle,
  svgPoints,
} from './render';
import type {
  AnnotationRenderer,
  AnnotationStyle,
  RenderContext,
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
      /** Stub direction at gesture start, degrees clockwise from screen up. */
      baseDirectionAngle: number;
      /** How far the gesture has turned the shape so far. */
      appliedDelta: number;
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
  private readonly renderer: AnnotationRenderer | undefined;
  private readonly accessibleLabel: ((annotation: ShapeData) => string) | undefined;
  private focusedId: string | null = null;
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
  private labelLayer: SVGGElement;
  private handleLayer: SVGGElement;
  private drag: DragState | null = null;
  private polygonDraft: Point[] = [];
  private lastPolygonClick: { point: Point; time: number } | null = null;
  private destroyed = false;
  private renderScheduled = false;
  private projection: ProjectionMatrix | null = null;
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
    this.renderer = options.renderer;
    this.accessibleLabel = options.accessibleLabel;
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
    // Not role="application": that tells a screen reader to surrender all its
    // own key handling, which is only honest for a widget that implements a
    // complete keyboard model of its own. This is a group of button-like
    // shapes, and `group` lets normal reading commands keep working.
    this.svg.setAttribute('role', 'group');
    this.svg.setAttribute('aria-label', 'Annotations');

    this.shapeLayer = createSvgElement('g');
    this.draftLayer = createSvgElement('g');
    // Labels and handles stay outside the projected layers: both must keep a
    // constant screen size, which a scaling transform would defeat.
    this.labelLayer = createSvgElement('g');
    this.handleLayer = createSvgElement('g');
    this.svg.append(this.shapeLayer, this.draftLayer, this.labelLayer, this.handleLayer);
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

  /**
   * Rotates an annotation by `degrees` about a pivot, defaulting to its centre.
   *
   * One committed change, so it is one undo step whether it came from a drag,
   * a keyboard press, or a host call.
   */
  rotate(id: string, degrees: number, options: { pivot?: Point; snap?: boolean } = {}): boolean {
    const annotation = this.store.get(id);
    if (!annotation || !this.store.canRotate(id)) return false;

    const applied = options.snap
      ? snapAngle(degrees, this.config.rotation.snapIncrement ?? 15)
      : degrees;
    const rotated = rotateShape(annotation, applied, options.pivot) as ShapeData;
    return this.store.batch('rotate', () => {
      this.store.update(rotated, { operation: 'rotate' });
      return true;
    });
  }

  /**
   * Replaces an annotation's geometry outright.
   *
   * The entry point for an accessible coordinate form: a host can render number
   * inputs and write exact values back without synthesising pointer events.
   */
  setGeometry(id: string, geometry: ShapeData['geometry'], options: { constrain?: boolean } = {}): boolean {
    const annotation = this.store.get(id);
    if (!annotation || !this.store.canEdit(id)) return false;

    const next = { ...annotation, geometry } as ShapeData;
    const constrained =
      options.constrain === false ? next : (constrainShape(next, this.canvasSize) as ShapeData);
    return this.store.batch('programmatic', () => {
      this.store.update(constrained, { operation: 'programmatic' });
      return true;
    });
  }

  /** Moves an annotation by a delta in image pixels. */
  nudge(id: string, delta: Point): boolean {
    const annotation = this.store.get(id);
    if (!annotation || !this.store.canEdit(id)) return false;

    const moved = translateShape(annotation, delta, this.canvasSize) as ShapeData;
    return this.store.batch('move', () => {
      this.store.update(moved, { operation: 'move' });
      return true;
    });
  }

  /**
   * Inserts a vertex into a polygon or freehand path.
   *
   * With no point supplied, the vertex lands on the segment nearest `near`,
   * which is what a click on an edge means.
   */
  insertVertex(id: string, near: Point): boolean {
    const annotation = this.store.get(id);
    if (!annotation || !this.store.canEdit(id)) return false;
    if (annotation.type !== 'polygon' && annotation.type !== 'freehand') return false;

    const segment = nearestSegment(
      annotation.geometry.points,
      near,
      annotation.type === 'polygon',
    );
    if (!segment) return false;

    const next = insertVertex(annotation, segment.index, segment.point);
    return this.store.batch('vertex', () => {
      this.store.update(next, { operation: 'vertex' });
      return true;
    });
  }

  /**
   * Removes a vertex.
   *
   * Refuses below three points for a polygon and two for a path, because the
   * result could not be rendered or serialized as that shape.
   */
  removeVertex(id: string, index: number): boolean {
    const annotation = this.store.get(id);
    if (!annotation || !this.store.canEdit(id)) return false;

    const next = removeVertex(annotation, index);
    if (next === annotation) return false;

    return this.store.batch('vertex', () => {
      this.store.update(next, { operation: 'vertex' });
      return true;
    });
  }

  /** Commits the in-progress polygon draft, if it has enough points. */
  commitDraft(): boolean {
    if (this.polygonDraft.length < 3) return false;
    this.commitPolygonDraft();
    return true;
  }

  /** Abandons any in-progress draft or gesture. */
  cancelDrawing(): void {
    this.cancelDraft();
  }

  /** Points currently in the polygon draft. */
  getDraft(): Point[] {
    return [...this.polygonDraft];
  }

  /** Whether rotation-correct projection is available for this viewer. */
  hasAccurateProjection(): boolean {
    return hasAccurateProjection(this.viewer);
  }

  /**
   * What this build supports.
   *
   * Lets a host feature-detect rather than sniff the version, which matters
   * while capabilities are still being added.
   */
  static readonly capabilities = {
    rotation: true,
    history: true,
    incrementalUpdates: true,
    renderer: true,
    keyboard: true,
    orientedRect: true,
  } as const;

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

    if (this.frameHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = null;
    this.renderScheduled = false;

    for (const remove of this.removeHandlers) remove();
    this.removeHandlers = [];
    this.root.remove();

    if (this.containerPosition !== null) {
      this.viewer.container.style.position = this.containerPosition;
      this.containerPosition = null;
    }
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

    drag.appliedDelta = delta;
    return rotateShape(drag.original, delta, drag.pivot) as ShapeData;
  }

  /** The stub's resting angle for a shape, clockwise from screen up. */
  private stubAngleFor(selected: ShapeData): number {
    return normalizeAngle(shapeRotation(selected));
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
    // An empty computed value means the property was never set, which is
    // static. jsdom reports it that way, and so do some server-rendered trees.
    if (position === 'static' || position === '') {
      // Recorded so destroy can put it back. Leaving `relative` behind changes
      // the host's layout for every element positioned against this container.
      this.containerPosition = container.style.position;
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
    // Focus is tracked separately from selection: a keyboard user tabs through
    // shapes before choosing one, and the two states need different styling.
    this.listenEvent(this.svg, 'focusin', ((event: FocusEvent) => {
      const id = (event.target as SVGElement | null)?.dataset?.annotationId;
      if (id && id !== this.focusedId) {
        this.focusedId = id;
        this.renderUnlessSuspended();
      }
    }) as EventListener);
    this.listenEvent(this.svg, 'focusout', (() => {
      if (this.focusedId === null) return;
      this.focusedId = null;
      this.renderUnlessSuspended();
    }) as EventListener);

    // The viewport stream fires on every frame of a pan or zoom. Coalescing to
    // one render per animation frame is the difference between rebuilding the
    // overlay sixty times a second and once.
    for (const eventName of OSD_EVENTS) {
      const handler = () => this.scheduleRender();
      this.viewer.addHandler?.(eventName, handler);
      this.removeHandlers.push(() => this.viewer.removeHandler?.(eventName, handler));
    }
    this.listen(window, 'resize', () => this.scheduleRender());
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
            originalAngle: shapeRotation(hit.annotation),
            baseDirectionAngle: this.stubAngleFor(hit.annotation),
            appliedDelta: 0,
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

  /**
   * Whether a key event belongs to something else.
   *
   * A shortcut swallowed from inside a host's text field is a real bug, and the
   * previous check missed `select` and any region a host marks as editing.
   */
  private isEditingTarget(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    // A host opts a whole subtree out with a data attribute.
    return typeof target.closest === 'function' && target.closest('[data-annotation-keys="off"]') !== null;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (this.isEditingTarget(event)) return;

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
      if (!this.store.canDelete(this.store.selectedId)) return;
      event.preventDefault();
      this.delete(this.store.selectedId);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      // Inside a polygon draft, undo drops the last point rather than reaching
      // into committed history — the draft is not committed yet.
      if (this.mode === 'draw-polygon' && this.polygonDraft.length > 0) {
        event.preventDefault();
        this.polygonDraft = this.polygonDraft.slice(0, -1);
        this.render();
        return;
      }
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
      return;
    }

    if (event.key === 'Enter' && this.mode === 'draw-polygon' && this.polygonDraft.length >= 3) {
      event.preventDefault();
      this.commitPolygonDraft();
      return;
    }

    if (this.config.keyboard.enabled === false) return;
    if (this.handleSelectionKeys(event)) return;
    if (this.handleGeometryKeys(event)) return;
  };

  /** Tab-like traversal of the annotation list from the keyboard. */
  private handleSelectionKeys(event: KeyboardEvent): boolean {
    if (event.key !== 'Tab' && event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return false;
    // Arrow keys move geometry when something is selected; they only traverse
    // when nothing is.
    if (event.key !== 'Tab' && this.store.selectedId) return false;

    const selectable = this.store.visible().filter((item) => this.store.canSelect(item.id));
    if (selectable.length === 0) return false;

    const current = selectable.findIndex((item) => item.id === this.store.selectedId);
    const backwards = event.shiftKey || event.key === 'ArrowLeft';
    const next = current === -1
      ? (backwards ? selectable.length - 1 : 0)
      : (current + (backwards ? -1 : 1) + selectable.length) % selectable.length;

    const target = selectable[next];
    if (!target) return false;

    event.preventDefault();
    this.focusedId = target.id;
    this.select(target.id);
    this.focusShape(target.id);
    return true;
  }

  /** Arrow-key movement, resizing, and rotation for the selected shape. */
  private handleGeometryKeys(event: KeyboardEvent): boolean {
    const id = this.store.selectedId;
    if (!id) return false;

    const keyboard = this.config.keyboard;
    const step = event.shiftKey ? (keyboard.coarseMoveStep ?? 10) : (keyboard.moveStep ?? 1);

    const deltas: Record<string, Point> = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
    };

    if (event.key === '[' || event.key === ']') {
      if (!this.config.rotation.enabled || !this.store.canRotate(id)) return false;
      event.preventDefault();
      const amount = keyboard.rotateStep ?? 15;
      this.rotate(id, event.key === ']' ? amount : -amount);
      return true;
    }

    const delta = deltas[event.key];
    if (!delta) return false;
    if (!this.store.canEdit(id)) return false;

    event.preventDefault();

    // Alt turns the arrows into a resize rather than a move.
    if (event.altKey) {
      const annotation = this.store.get(id);
      if (annotation?.type === 'rect') {
        const resizeStep = keyboard.resizeStep ?? 1;
        const rect = normalizeRect(annotation.geometry);
        const widened = delta.x !== 0;
        const next = {
          ...rect,
          w: widened ? Math.max(this.config.minShapeSize.width, rect.w + Math.sign(delta.x) * resizeStep) : rect.w,
          h: widened ? rect.h : Math.max(this.config.minShapeSize.height, rect.h + Math.sign(delta.y) * resizeStep),
        };
        this.setGeometry(id, next);
        return true;
      }
    }

    this.nudge(id, delta);
    return true;
  }

  /** Moves DOM focus to a shape, so a screen reader follows the selection. */
  private focusShape(id: string) {
    const element = this.shapeLayer.querySelector<SVGElement>(`[data-annotation-id="${CSS.escape(id)}"]`);
    element?.focus?.();
  }

  private commitDraw(drag: Extract<DragState, { kind: 'draw' }>, shiftKey: boolean) {
    const [start, rawEnd] = drag.points;
    const end = this.mode === 'draw-line' && shiftKey ? snapLinePoint(start, rawEnd) : rawEnd;
    if (this.mode === 'draw-rect') {
      const rect = constrainDrawnRect(start, end, {
        square: this.config.shapes.rect?.square || shiftKey,
        fromCenter: this.config.shapes.rect?.fromCenter ?? false,
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
      const minimumLength = this.config.shapes.freehand?.minLength ?? 0;
      if (points.length < 2 || (minimumLength > 0 && pathLength(points) < minimumLength)) {
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
    const minimumArea = this.config.shapes.polygon?.minArea ?? 0;
    if (minimumArea > 0 && polygonArea(points) < minimumArea) {
      this.cancelDraft();
      return;
    }
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

  /**
   * Rebuilds the overlay: shape structure plus the projection.
   *
   * Called when the annotations themselves change. A viewport change goes
   * through `updateProjection` alone, which is the point of drawing shapes in
   * image coordinates.
   */
  private render() {
    if (this.destroyed) return;
    this.renderShapes();
    this.updateProjection();
  }

  /** Rebuilds the shape elements. Their coordinates are image pixels. */
  private renderShapes() {
    this.svg.style.pointerEvents = modeToShape(this.mode) ? 'auto' : 'none';
    this.shapeLayer.replaceChildren();
    this.draftLayer.replaceChildren();

    this.store.forEachVisible((annotation) => this.renderAnnotation(annotation));
    if (this.drag?.kind === 'draw') this.renderDraft();
    if (this.polygonDraft.length > 0) this.renderPolygonDraft();
  }

  /**
   * Reprojects without rebuilding.
   *
   * Shapes move by one `transform` attribute however many of them there are.
   * Only the things that must keep a constant screen size are recomputed:
   * handles, labels, and point glyphs, of which there are a handful rather than
   * one per vertex of every annotation on the canvas.
   */
  private updateProjection() {
    if (this.destroyed) return;

    const rect = this.viewer.container.getBoundingClientRect();
    this.svg.setAttribute('width', String(rect.width));
    this.svg.setAttribute('height', String(rect.height));
    this.svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

    const matrix = projectionMatrix(this.viewer, this.canvasSize);
    this.projection = matrix;
    const transform = matrixToTransform(matrix);
    this.shapeLayer.setAttribute('transform', transform);
    this.draftLayer.setAttribute('transform', transform);

    this.rescaleConstantSizeElements(matrix);
    this.handleLayer.replaceChildren();
    this.renderHandles();
    this.renderDraftHandles();
    this.renderLabels();
  }

  /**
   * Keeps glyphs the same size on screen as the image scales under them.
   *
   * A point drawn inside the transformed layer would otherwise grow with the
   * zoom until it swallowed the region it marks.
   */
  private rescaleConstantSizeElements(matrix: ProjectionMatrix) {
    for (const element of this.shapeLayer.querySelectorAll<SVGElement>('[data-scale-invariant]')) {
      const base = Number(element.dataset.scaleInvariant);
      if (!Number.isFinite(base)) continue;
      element.setAttribute('r', String(base / matrix.scale));
    }
  }

  /** Builds the context every renderer hook receives. */
  private renderContext(annotation: ShapeData): RenderContext {
    const points = toPolygonPoints(annotation).map((point) => this.toElement(point));
    return {
      annotation,
      style: resolveStyle(annotation, this.theme, this.style) as AnnotationStyle,
      selected: annotation.id === this.store.selectedId,
      focused: annotation.id === this.focusedId,
      points,
      bounds: boundsOfPoints(points),
      viewportRotation: this.viewportRotation(),
    };
  }

  private viewportRotation(): number {
    const viewport = this.viewer.viewport as { getRotation?: (current?: boolean) => number };
    const rotation = viewport?.getRotation?.(true);
    return Number.isFinite(rotation) ? (rotation as number) : 0;
  }

  private renderAnnotation(annotation: ShapeData) {
    const context = this.renderContext(annotation);
    const { style, selected: active } = context;

    const custom = this.renderer?.renderShape?.(context);
    let element: SVGElement;

    if (custom) {
      element = custom;
    } else if (annotation.type === 'rect' && shapeRotation(annotation) !== 0) {
      // A turned rectangle is drawn as the polygon of its rotated corners; an
      // SVG rect cannot express one without a transform attribute that would
      // then have to be undone by everything reading the element.
      element = createSvgElement('polygon');
      element.setAttribute('points', svgPoints(pointsFor(annotation)));
      applyShapeStyle(element, style, { active, fill: true });
    } else if (annotation.type === 'rect') {
      const rect = normalizeRect(annotation.geometry);
      element = createSvgElement('rect');
      element.setAttribute('x', String(rect.x));
      element.setAttribute('y', String(rect.y));
      element.setAttribute('width', String(rect.w));
      element.setAttribute('height', String(rect.h));
      const radius = this.config.shapes.rect?.borderRadius ?? 0;
      element.setAttribute('rx', String(radius));
      element.setAttribute('ry', String(radius));
      applyShapeStyle(element, style, { active, fill: true });
    } else if (annotation.type === 'point') {
      const glyph = this.renderer?.renderPointGlyph?.(context);
      if (glyph) {
        element = glyph;
      } else {
        element = createSvgElement('circle');
        element.setAttribute('cx', String(annotation.geometry.x));
        element.setAttribute('cy', String(annotation.geometry.y));
        // Marked so the projection pass can hold its screen radius steady as
        // the image scales underneath it.
        element.dataset.scaleInvariant = '6';
        element.setAttribute('r', String(6 / (this.projection?.scale ?? 1)));
        applyShapeStyle(element, style, { active, fill: true });
      }
    } else if (annotation.type === 'line') {
      const [start, end] = pointsFor(annotation);
      element = createSvgElement('line');
      element.setAttribute('x1', String(start?.x ?? 0));
      element.setAttribute('y1', String(start?.y ?? 0));
      element.setAttribute('x2', String(end?.x ?? 0));
      element.setAttribute('y2', String(end?.y ?? 0));
      element.setAttribute('stroke-linecap', this.config.shapes.line?.lineCap ?? 'round');
      applyShapeStyle(element, style, { active, fill: false });
    } else {
      // pointsFor, not geometry.points: the outline carries the shape's
      // rotation, and drawing the stored points would make a rotated polygon
      // look exactly like an unrotated one.
      element = createSvgElement(annotation.type === 'polygon' ? 'polygon' : 'polyline');
      element.setAttribute('points', svgPoints(pointsFor(annotation)));
      element.setAttribute('stroke-linecap', this.config.shapes.line?.lineCap ?? 'round');
      element.setAttribute('stroke-linejoin', this.config.shapes.line?.lineJoin ?? 'round');
      applyShapeStyle(element, style, { active, fill: annotation.type === 'polygon' });
    }

    const policy = this.store.policyFor(annotation);
    element.dataset.annotationId = annotation.id;
    element.style.pointerEvents = policy.selectable ? 'visiblePainted' : 'none';
    element.style.cursor = this.mode === 'select' ? (policy.editable ? 'move' : 'pointer') : 'crosshair';
    element.setAttribute('tabindex', policy.selectable ? '0' : '-1');
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', this.accessibleLabelFor(annotation));
    if (active) element.setAttribute('aria-pressed', 'true');
    if (!policy.editable) element.setAttribute('aria-readonly', 'true');
    if (context.focused) element.classList.add(`${CLASS_NAME}__shape--focused`);

    const extraClass = this.renderer?.shapeClassName?.(context);
    if (extraClass) element.setAttribute('class', extraClass);
    const extraData = this.renderer?.shapeData?.(context);
    if (extraData) {
      for (const [key, value] of Object.entries(extraData)) element.dataset[key] = value;
    }

    this.shapeLayer.append(element);
  }

  /**
   * Draws the labels, in element space.
   *
   * Only shapes that actually carry one are projected, so this stays cheap even
   * though it runs on every viewport change: most annotations have no label.
   */
  private renderLabels() {
    this.labelLayer.replaceChildren();
    const hasHook = Boolean(this.renderer?.label);

    this.store.forEachVisible((annotation) => {
      if (!hasHook && !annotation.label) return;
      this.renderLabel(this.renderContext(annotation));
    });
  }

  private accessibleLabelFor(annotation: ShapeData): string {
    const supplied = this.accessibleLabel?.(annotation);
    if (supplied) return supplied;
    return annotation.label || annotation.text || `${annotation.type} annotation`;
  }

  /**
   * Draws a label under host control.
   *
   * The font size is clamped between explicit bounds. Without a ceiling a large
   * region produces headline-sized text, which is what drove Mango to observe
   * and rewrite this package's SVG from outside.
   */
  private renderLabel(context: RenderContext) {
    const spec = this.renderer?.label?.(context) ?? {};
    if (spec.visible === false) return;

    const text = spec.text ?? context.annotation.label;
    if (!text) return;

    const placement = spec.placement ?? 'below';
    if (placement === 'none') return;

    const bounds = context.bounds;
    const minFontSize = spec.minFontSize ?? 11;
    const maxFontSize = spec.maxFontSize ?? 24;
    const fontSize = clamp(spec.fontSize ?? minFontSize, minFontSize, maxFontSize);

    const anchorY =
      placement === 'above'
        ? bounds.y - fontSize * 0.4
        : placement === 'center'
          ? bounds.y + bounds.h / 2
          : bounds.y + bounds.h + fontSize * 1.25;

    const element = createSvgElement('text');
    // A text node, never innerHTML: a label is host data, and injecting it as
    // markup into the overlay would make this package an XSS vector.
    element.textContent = text;
    element.setAttribute('x', String(bounds.x + bounds.w / 2));
    element.setAttribute('y', String(anchorY));
    element.setAttribute('text-anchor', 'middle');
    element.setAttribute('dominant-baseline', 'middle');
    element.setAttribute('font-size', String(fontSize));
    element.setAttribute('fill', '#f8fafc');
    element.setAttribute('paint-order', 'stroke');
    element.setAttribute('stroke', 'rgba(15, 23, 42, 0.9)');
    element.setAttribute('stroke-width', String(Math.max(1, fontSize * 0.25)));
    element.style.pointerEvents = 'none';
    element.dataset.annotationId = context.annotation.id;
    element.dataset.role = 'label';

    // Upright by default. A label that follows a rotated shape is unreadable at
    // most angles, so following is opt-in.
    const shapeAngle = shapeRotation(context.annotation);
    if (spec.orientation === 'shape' && shapeAngle !== 0) {
      const centre = { x: bounds.x + bounds.w / 2, y: anchorY };
      element.setAttribute('transform', `rotate(${shapeAngle} ${centre.x} ${centre.y})`);
    }

    if (spec.className) element.setAttribute('class', spec.className);
    if (spec.data) {
      for (const [key, value] of Object.entries(spec.data)) element.dataset[key] = value;
    }

    this.labelLayer.append(element);
  }

  private renderHandles() {
    const selected = this.selectedAnnotation();
    if (!selected || this.mode !== 'select') return;
    if (!this.store.canEdit(selected.id)) return;

    const size = this.config.handleSize;
    // The selected shape's handles carry `activeColor`, which is where the
    // selected state shows without displacing the layer colour on the stroke.
    const accent = (resolveStyle(selected, this.theme, this.style) as AnnotationStyle).activeColor;

    if (selected.type === 'rect') {
      // One path at any angle: the handles are named in the shape's own frame
      // and positioned on its rotated outline.
      for (const [handle, point] of resizeHandlesFor(selected)) {
        this.renderHandle(
          point,
          handle,
          selected.id,
          size,
          undefined,
          accent,
          shapeRotation(selected),
        );
      }
      this.renderRotationHandle(selected, accent);
      return;
    }

    // The drawn outline, so a handle sits on the vertex a user can see rather
    // than on where that vertex would be if the shape were not turned.
    pointsFor(selected).forEach((point, index) =>
      this.renderHandle(point, 'vertex', selected.id, size, index, accent),
    );
    this.renderRotationHandle(selected, accent);
  }

  /**
   * Draws the rotation handle above the shape.
   *
   * Positioned in element space at a fixed screen distance, so it stays the
   * same size and the same reach at every zoom level. Off unless the host
   * enables rotation, because adding a handle to every selection would change
   * the UI of every existing consumer.
   */
  private renderRotationHandle(selected: ShapeData, accent: string) {
    if (!this.config.rotation.enabled) return;
    if (selected.type === 'point') return;
    if (!this.store.canRotate(selected.id)) return;

    const anchor = this.rotationHandlePosition(selected);
    if (!anchor) return;

    // A short stub from the top edge, not a line from the shape's centre. The
    // centre version grew with the shape and with zoom, which is why it read as
    // a stray line rather than as part of the selection.
    const stub = createSvgElement('line');
    stub.setAttribute('x1', String(anchor.base.x));
    stub.setAttribute('y1', String(anchor.base.y));
    stub.setAttribute('x2', String(anchor.handle.x));
    stub.setAttribute('y2', String(anchor.handle.y));
    stub.setAttribute('stroke', accent);
    stub.setAttribute('stroke-width', '1.5');
    stub.setAttribute('vector-effect', 'non-scaling-stroke');
    stub.style.pointerEvents = 'none';
    this.handleLayer.append(stub);

    const element = createSvgElement('circle');
    // Constant screen radius, so the affordance does not change size with the
    // shape or the zoom level.
    const radius = Math.max(5, this.config.handleSize / 2);
    element.setAttribute('cx', String(anchor.handle.x));
    element.setAttribute('cy', String(anchor.handle.y));
    element.setAttribute('r', String(radius));
    element.setAttribute('fill', accent);
    element.setAttribute('stroke', this.config.handleStrokeColor);
    element.setAttribute('stroke-width', '1.5');
    element.setAttribute('vector-effect', 'non-scaling-stroke');
    element.dataset.annotationId = selected.id;
    element.dataset.handle = 'rotate';
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', 'Rotate annotation');
    element.style.pointerEvents = 'all';
    element.style.cursor = 'grab';
    this.handleLayer.append(element);
  }

  /**
   * The direction the rotation stub points, as a unit vector in element space.
   *
   * An oriented rectangle carries its own angle, so the stub follows the
   * shape's own up direction and turns with it. A polygon or path stores only
   * points and has no angle to read, so the stub rests at screen up — stable
   * and predictable rather than derived from whichever vertex happens to be
   * highest.
   *
   * While a rotation gesture is running, the direction follows the pointer, so
   * the handle stays under the cursor that is holding it instead of jumping
   * around as the shape's bounding box changes underneath.
   */
  private rotationDirection(selected: ShapeData): Point {
    const drag = this.drag;
    if (drag?.kind === 'rotate' && drag.id === selected.id) {
      const radians = (drag.appliedDelta + drag.baseDirectionAngle) * (Math.PI / 180);
      return { x: Math.sin(radians), y: -Math.cos(radians) };
    }

    // Every shape carries its own angle now, so the stub turns with any of
    // them and stays where the user left it — the Slides and PowerPoint
    // behaviour. Element space already carries the viewport's rotation, so the
    // shape's own angle is the only correction needed.
    const radians = shapeRotation(selected) * (Math.PI / 180);
    return { x: Math.sin(radians), y: -Math.cos(radians) };
  }

  /**
   * Where the rotation stub starts and ends, in element space.
   *
   * The base sits where the shape's own silhouette ends in the stub's
   * direction, so the stub always touches the shape. Anchoring to the top of
   * the bounding box instead left it floating in empty space beside anything
   * that is not roughly rectangular — a triangle, or any polygon whose highest
   * point is off to one side.
   */
  private rotationHandlePosition(
    selected: ShapeData,
  ): { base: Point; handle: Point } | null {
    const projected = toPolygonPoints(selected).map((point) => this.toElement(point));
    if (projected.length === 0) return null;

    const centre = this.toElement(shapeCenter(selected));
    const direction = this.rotationDirection(selected);
    const distanceOut = this.config.rotation.handleDistance ?? 28;

    // How far the outline reaches in that direction.
    let extent = 0;
    for (const point of projected) {
      const reach = (point.x - centre.x) * direction.x + (point.y - centre.y) * direction.y;
      if (reach > extent) extent = reach;
    }

    const base = {
      x: centre.x + direction.x * extent,
      y: centre.y + direction.y * extent,
    };
    return {
      base,
      handle: {
        x: base.x + direction.x * distanceOut,
        y: base.y + direction.y * distanceOut,
      },
    };
  }

  /**
   * Handles for the points already placed in a polygon draft.
   *
   * Drawn here rather than alongside the draft outline because the handle layer
   * is rebuilt by the projection pass, which runs after the shape pass — a
   * handle added earlier would be cleared before anyone saw it.
   */
  private renderDraftHandles() {
    if (this.polygonDraft.length === 0) return;
    const size = Math.max(6, this.config.handleSize - 2);
    for (const point of this.polygonDraft) {
      this.renderHandle(point, 'draft', 'draft', size);
    }
  }

  private renderHandle(
    point: Point,
    handle: string,
    id: string,
    size: number,
    vertexIndex?: number,
    accent?: string,
    shapeRotation = 0,
  ) {
    const projected = this.toElement(point);
    const element = createSvgElement('rect');
    element.setAttribute('x', String(projected.x - size / 2));
    element.setAttribute('y', String(projected.y - size / 2));
    element.setAttribute('width', String(size));
    element.setAttribute('height', String(size));
    element.setAttribute('rx', '2');
    element.setAttribute('fill', accent ?? this.config.handleColor);
    element.setAttribute('stroke', this.config.handleStrokeColor);
    element.setAttribute('stroke-width', '1.5');
    element.setAttribute('vector-effect', 'non-scaling-stroke');
    element.dataset.annotationId = id;
    element.dataset.handle = handle;
    if (vertexIndex != null) element.dataset.vertexIndex = String(vertexIndex);
    element.style.pointerEvents = 'all';
    element.style.cursor = handle === 'vertex' ? 'move' : this.resizeCursor(handle, shapeRotation);
    this.handleLayer.append(element);
  }

  /**
   * Cursor for a resize handle, turned to follow the viewport.
   *
   * A handle labelled `n` is not pointing north once the canvas is rotated, and
   * a cursor that disagrees with the direction the handle actually moves is
   * worse than no cursor at all.
   */
  private resizeCursor(handle: string, shapeRotation = 0): string {
    const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
    const index = directions.indexOf(handle);
    if (index === -1) return 'move';

    const rotation = normalizeAngle(this.viewportRotation() + shapeRotation);
    const steps = Math.round(rotation / 45);
    const rotated = directions[(index + steps) % directions.length] as string;
    return `${rotated}-resize`;
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
        const element = createSvgElement('rect');
        element.setAttribute('x', String(rect.x));
        element.setAttribute('y', String(rect.y));
        element.setAttribute('width', String(rect.w));
        element.setAttribute('height', String(rect.h));
        applyShapeStyle(element, style, { fill: true });
        this.draftLayer.append(element);
      } else if (this.mode === 'draw-line') {
        const element = createSvgElement('line');
        element.setAttribute('x1', String(start.x));
        element.setAttribute('y1', String(start.y));
        element.setAttribute('x2', String(end.x));
        element.setAttribute('y2', String(end.y));
        applyShapeStyle(element, style, { fill: false });
        this.draftLayer.append(element);
      } else if (this.mode === 'draw-freehand') {
        const element = createSvgElement('polyline');
        element.setAttribute(
          'points',
          svgPoints(this.drag.points),
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
      svgPoints(points),
    );
    applyShapeStyle(element, style, { fill: false });
    this.draftLayer.append(element);
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

    // The rotation handle sits outside the shape, so it is tested first — a
    // vertex handle underneath would otherwise win by proximity.
    if (this.config.rotation.enabled && selected.type !== 'point') {
      const anchor = this.rotationHandlePosition(selected);
      if (anchor && distance(this.toElement(point), anchor.handle) <= tolerance + 2) {
        return { kind: 'handle', annotation: selected, handle: 'rotate' };
      }
    }
    if (selected.type === 'rect') {
      for (const [name, handlePoint] of resizeHandlesFor(selected)) {
        if (this.elementDistance(point, handlePoint) <= tolerance) {
          return { kind: 'handle', annotation: selected, handle: name };
        }
      }
      return null;
    }
    const points = pointsFor(selected);
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
