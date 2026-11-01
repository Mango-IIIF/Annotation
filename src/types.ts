export type Point = {
  x: number;
  y: number;
};
export type CanvasSize = {
  width: number;
  height: number;
};

export type ShapeType = 'rect' | 'polygon' | 'point' | 'line' | 'freehand';

export interface RectGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ShapeGeometry =
  | RectGeometry
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
  /**
   * Clockwise degrees about the shape's own centre.
   *
   * Geometry is always stored unrotated, so `x`/`y`/`w`/`h` and `points` keep
   * meaning exactly what they always meant. Use `toPolygonPoints` for the
   * outline as drawn. A host that ignores this field sees the shape as it was
   * before any rotation, which is the safe reading rather than a wrong one.
   */
  rotation?: number;
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
  /**
   * Clockwise degrees about the shape's own centre.
   *
   * Geometry is always stored unrotated, so `x`/`y`/`w`/`h` and `points` keep
   * meaning exactly what they always meant. Use `toPolygonPoints` for the
   * outline as drawn. A host that ignores this field sees the shape as it was
   * before any rotation, which is the safe reading rather than a wrong one.
   */
  rotation?: number;
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
  /**
   * Clockwise degrees about the shape's own centre.
   *
   * Geometry is always stored unrotated, so `x`/`y`/`w`/`h` and `points` keep
   * meaning exactly what they always meant. Use `toPolygonPoints` for the
   * outline as drawn. A host that ignores this field sees the shape as it was
   * before any rotation, which is the safe reading rather than a wrong one.
   */
  rotation?: number;
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
  /**
   * Clockwise degrees about the shape's own centre.
   *
   * Geometry is always stored unrotated, so `x`/`y`/`w`/`h` and `points` keep
   * meaning exactly what they always meant. Use `toPolygonPoints` for the
   * outline as drawn. A host that ignores this field sees the shape as it was
   * before any rotation, which is the safe reading rather than a wrong one.
   */
  rotation?: number;
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
  /**
   * Clockwise degrees about the shape's own centre.
   *
   * Geometry is always stored unrotated, so `x`/`y`/`w`/`h` and `points` keep
   * meaning exactly what they always meant. Use `toPolygonPoints` for the
   * outline as drawn. A host that ignores this field sees the shape as it was
   * before any rotation, which is the safe reading rather than a wrong one.
   */
  rotation?: number;
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
