import type { AnnotationChange, HistoryState } from './history';

export type Point = {
  x: number;
  y: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

export type ShapeType = 'rect' | 'oriented-rect' | 'polygon' | 'point' | 'line' | 'freehand';

export type EditorMode =
  | 'none'
  | 'select'
  | 'draw-rect'
  | 'draw-polygon'
  | 'draw-point'
  | 'draw-line'
  | 'draw-freehand'
  | 'rectangle'
  | 'polygon'
  | 'point'
  | 'line'
  | 'freehand';

export type CanonicalEditorMode =
  | 'none'
  | 'select'
  | 'draw-rect'
  | 'draw-polygon'
  | 'draw-point'
  | 'draw-line'
  | 'draw-freehand';

export interface RectGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A rectangle with an orientation.
 *
 * A separate shape rather than an angle bolted onto `RectAnnotation`, so that
 * `x`, `y`, `w`, and `h` never become ambiguous. A host that does not
 * understand rotation can ignore this variant entirely, and one that does can
 * project it with `toPolygonPoints`.
 */
export interface OrientedRectGeometry {
  center: Point;
  w: number;
  h: number;
  /** Clockwise degrees about `center`. */
  angle: number;
}

export type ShapeGeometry =
  | RectGeometry
  | OrientedRectGeometry
  | { points: Point[] }
  | { start: Point; end: Point }
  | Point;

export type RectAnnotation = {
  id: string;
  type: 'rect';
  geometry: { x: number; y: number; w: number; h: number };
  layer?: string;
  label?: string;
  text?: string;
  data?: unknown;
  style?: Partial<AnnotationStyle>;
};

export type OrientedRectAnnotation = {
  id: string;
  type: 'oriented-rect';
  geometry: OrientedRectGeometry;
  layer?: string;
  label?: string;
  text?: string;
  data?: unknown;
  style?: Partial<AnnotationStyle>;
};

export type PolygonAnnotation = {
  id: string;
  type: 'polygon';
  geometry: { points: Point[] };
  layer?: string;
  label?: string;
  text?: string;
  data?: unknown;
  style?: Partial<AnnotationStyle>;
};

export type PointAnnotation = {
  id: string;
  type: 'point';
  geometry: Point;
  layer?: string;
  label?: string;
  text?: string;
  data?: unknown;
  style?: Partial<AnnotationStyle>;
};

export type LineAnnotation = {
  id: string;
  type: 'line';
  geometry: { start: Point; end: Point };
  layer?: string;
  label?: string;
  text?: string;
  data?: unknown;
  style?: Partial<AnnotationStyle>;
};

export type FreehandAnnotation = {
  id: string;
  type: 'freehand';
  geometry: { points: Point[] };
  layer?: string;
  label?: string;
  text?: string;
  data?: unknown;
  style?: Partial<AnnotationStyle>;
};

export type ShapeData =
  | RectAnnotation
  | OrientedRectAnnotation
  | PolygonAnnotation
  | PointAnnotation
  | LineAnnotation
  | FreehandAnnotation;

export type AnnotationStyle = {
  strokeColor: string;
  strokeWidth: number;
  /** May carry its own alpha, in which case leave `fillOpacity` unset. */
  fillColor: string;
  /**
   * Separate fill alpha.
   *
   * Optional and unset by default, because `fillColor` conventionally carries
   * its own alpha and emitting both would multiply them.
   */
  fillOpacity?: number;
  opacity: number;
  /** Accent for the selected state. Applied to that shape's handles. */
  activeColor: string;
};

export type AnnotationTheme = {
  defaults?: Partial<AnnotationStyle>;
  layers?: Record<string, Partial<AnnotationStyle>>;
};

export type ShapeConfig = {
  rect?: {
    borderRadius?: number;
  };
  line?: {
    lineCap?: CanvasLineCap;
    lineJoin?: CanvasLineJoin;
    showDirectionArrow?: boolean;
  };
  freehand?: {
    simplifyTolerance?: number;
  };
};

/** How per-shape rotation behaves, when it is enabled. */
export type RotationConfig = {
  /** Off by default: enabling it changes the selection UI for existing hosts. */
  enabled?: boolean;
  /** Screen-space distance from the shape's top edge to the handle. */
  handleDistance?: number;
  /** Snap increment in degrees. */
  snapIncrement?: number;
  /** How near a cardinal angle snaps to it exactly. */
  cardinalTolerance?: number;
  /** Hold to invert snapping. */
  snapModifier?: 'shift' | 'alt' | 'ctrl' | 'meta';
  /** Snap on by default, with the modifier releasing it. */
  snapByDefault?: boolean;
};

/** Keyboard increments, in image pixels and degrees. */
export type KeyboardConfig = {
  enabled?: boolean;
  moveStep?: number;
  coarseMoveStep?: number;
  resizeStep?: number;
  rotateStep?: number;
};

export type EditorConfig = {
  handleSize?: number;
  rotation?: RotationConfig;
  keyboard?: KeyboardConfig;
  handleColor?: string;
  handleStrokeColor?: string;
  hitTolerance?: number;
  polygonCloseTolerance?: number;
  polygonDoubleClickDelay?: number;
  polygonDoubleClickTolerance?: number;
  minShapeSize?: {
    width: number;
    height: number;
  };
  shapes?: ShapeConfig;
};

export type OSDLikeViewer = {
  container: HTMLElement;
  canvas?: HTMLElement;
  viewport?: any;
  addHandler?: (name: any, handler: any) => void;
  removeHandler?: (name: any, handler: any) => void;
};

/** Neutral per-shape interaction permissions, decided by the host. */
export type InteractionPolicy = {
  selectable?: boolean;
  editable?: boolean;
  deletable?: boolean;
  rotatable?: boolean;
  visible?: boolean;
};

export type OSDAnnotationEditorOptions = {
  viewer: OSDLikeViewer;
  /** Maximum undo entries retained. */
  historyLimit?: number;
  /** Per-shape permissions. Called during render and hit testing, so keep it cheap. */
  policy?: (annotation: ShapeData) => InteractionPolicy | undefined;
  /** Customises how shapes and labels are drawn. */
  renderer?: AnnotationRenderer;
  /** Accessible name for a shape, overriding the default. */
  accessibleLabel?: (annotation: ShapeData) => string;
  canvasSize: CanvasSize;
  mode?: EditorMode;
  annotations?: ShapeData[];
  selectedId?: string | null;
  style?: Partial<AnnotationStyle>;
  theme?: AnnotationTheme;
  config?: EditorConfig;
  currentLayer?: string;
  keyboardTarget?: Window | HTMLElement | null;
  onSelectionChanged?: (id: string | null) => void;
  onAnnotationCreated?: (annotation: ShapeData) => void;
  onAnnotationUpdated?: (annotation: ShapeData) => void;
  onAnnotationDeleted?: (id: string) => void;
  onModeChanged?: (mode: CanonicalEditorMode) => void;
  /**
   * Every committed and preview change, with before and after geometry.
   *
   * Richer than the three callbacks above, which remain for compatibility. A
   * host wanting transactions should use this and ignore those.
   */
  onAnnotationChanged?: (change: AnnotationChange) => void;
  onHistoryChanged?: (state: HistoryState) => void;
};

/* ------------------------------------------------------------------ */
/* Rendering extension points                                          */
/* ------------------------------------------------------------------ */

/** What the renderer is told about a shape at draw time. */
export type RenderContext = {
  annotation: ShapeData;
  /** Resolved style after theme, layer, and per-shape overrides. */
  style: AnnotationStyle;
  selected: boolean;
  focused: boolean;
  /** Projected outline in viewer-element pixels. */
  points: Point[];
  /** Projected axis-aligned bounds in viewer-element pixels. */
  bounds: { x: number; y: number; w: number; h: number };
  /** Current viewport rotation in degrees, for keeping decorations upright. */
  viewportRotation: number;
};

export type LabelPlacement = 'below' | 'above' | 'center' | 'none';

/** Host control over a shape's label. */
export type LabelSpec = {
  text?: string;
  placement?: LabelPlacement;
  /** Clamped between these bounds, in screen pixels. */
  minFontSize?: number;
  maxFontSize?: number;
  fontSize?: number;
  /** Upright by default; `shape` follows the shape's own rotation. */
  orientation?: 'upright' | 'shape';
  className?: string;
  /** Written as data-* attributes on the label element. */
  data?: Record<string, string>;
  visible?: boolean;
};

/**
 * Customises drawing without a host reaching into package-owned SVG.
 *
 * Every hook is optional and falls back to the default. Returning extra classes
 * or data attributes is enough for most styling; `renderShape` exists for the
 * cases where it is not.
 */
export type AnnotationRenderer = {
  /** Extra classes for the shape element. */
  shapeClassName?: (context: RenderContext) => string | undefined;
  /** Extra data-* attributes for the shape element. */
  shapeData?: (context: RenderContext) => Record<string, string> | undefined;
  /** Overrides the label entirely. Return `{ visible: false }` to suppress it. */
  label?: (context: RenderContext) => LabelSpec | undefined;
  /** Replaces the shape element. Return undefined to keep the default. */
  renderShape?: (context: RenderContext) => SVGElement | undefined;
  /** Replaces the glyph drawn for a point shape. */
  renderPointGlyph?: (context: RenderContext) => SVGElement | undefined;
};
