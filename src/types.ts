export type Point = {
  x: number;
  y: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

export type ShapeType = 'rect' | 'polygon' | 'point' | 'line' | 'freehand';

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

export type ShapeGeometry =
  | { x: number; y: number; w: number; h: number }
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
  | PolygonAnnotation
  | PointAnnotation
  | LineAnnotation
  | FreehandAnnotation;

export type AnnotationStyle = {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillOpacity: number;
  opacity: number;
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

export type EditorConfig = {
  handleSize?: number;
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

export type OSDAnnotationEditorOptions = {
  viewer: OSDLikeViewer;
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
};
