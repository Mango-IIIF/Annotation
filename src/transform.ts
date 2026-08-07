import {
  basePoints,
  clamp,
  DEGREES_TO_RADIANS,
  normalizeRect,
  pointsFor,
  rectCorners,
  rotatePoint,
  shapePivot,
  shapeRotation,
} from './geometry';
import type { CanvasSize, Point, RectGeometry, ShapeData } from './types';

/**
 * Pure geometry transforms.
 *
 * Every function here is deterministic and free of DOM, viewport, and editor
 * state, so the interaction layer can be tested separately from the maths.
 *
 * Conventions, fixed once so nothing downstream has to guess:
 *
 * - Angles are degrees, not radians, at every public boundary.
 * - Positive angles rotate clockwise on screen. Screen y grows downward, so
 *   that is the same sign as the standard mathematical convention applied to a
 *   downward y axis, and it matches what OpenSeadragon does with `setRotation`.
 * - Rotation defaults to the shape's own centre.
 * - Constraints apply to a whole transformed shape, never point by point.
 *   Clamping individual points is what turns a rotated rectangle into a
 *   trapezium the moment it touches an edge.
 */

export { DEGREES_TO_RADIANS, rectCorners, rotatePoint, shapePivot, shapeRotation };

/** Normalizes any angle to the half-open range [0, 360). */
export const normalizeAngle = (degrees: number): number => {
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

/** Normalizes an angle to (-180, 180], the shortest signed turn. */
export const signedAngle = (degrees: number): number => {
  const normalized = normalizeAngle(degrees);
  return normalized > 180 ? normalized - 360 : normalized;
};

/** Snaps an angle to the nearest multiple of `increment` degrees. */
export const snapAngle = (degrees: number, increment: number): number => {
  if (!Number.isFinite(increment) || increment <= 0) return degrees;
  return Math.round(degrees / increment) * increment;
};

/**
 * Snaps to `increment`, but pulls harder toward 0/90/180/270.
 *
 * Cardinal angles are the ones a user is usually reaching for, and the plain
 * increment makes them no easier to hit than any other multiple.
 */
export const snapAngleWithCardinals = (
  degrees: number,
  increment: number,
  cardinalTolerance = 4,
): number => {
  const normalized = normalizeAngle(degrees);
  for (const cardinal of [0, 90, 180, 270, 360]) {
    if (Math.abs(normalized - cardinal) <= cardinalTolerance) {
      return normalizeAngle(cardinal);
    }
  }
  return normalizeAngle(snapAngle(normalized, increment));
};

/** Arithmetic mean of a set of points. */
export const centroid = (points: readonly Point[]): Point => {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
};

/**
 * The point a shape rotates about.
 *
 * Its unrotated centre, so repeated rotations pivot around the same place.
 */
export const shapeCenter = (shape: ShapeData): Point => shapePivot(shape);

export const boundsOfPoints = (points: readonly Point[]): RectGeometry => {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/** Scales a point about an origin. */
export const scalePoint = (
  point: Point,
  scaleX: number,
  scaleY: number,
  origin: Point,
): Point => ({
  x: origin.x + (point.x - origin.x) * scaleX,
  y: origin.y + (point.y - origin.y) * scaleY,
});

export const translatePoint = (point: Point, delta: Point): Point => ({
  x: point.x + delta.x,
  y: point.y + delta.y,
});

/**
 * An affine transform, so several operations compose into one pass over the
 * geometry rather than one pass each.
 *
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export const multiply = (first: Matrix, second: Matrix): Matrix => ({
  a: first.a * second.a + first.c * second.b,
  b: first.b * second.a + first.d * second.b,
  c: first.a * second.c + first.c * second.d,
  d: first.b * second.c + first.d * second.d,
  e: first.a * second.e + first.c * second.f + first.e,
  f: first.b * second.e + first.d * second.f + first.f,
});

/** Composes left to right: `compose(a, b)` applies `a` and then `b`. */
export const compose = (...matrices: readonly Matrix[]): Matrix =>
  matrices.reduce((accumulated, matrix) => multiply(matrix, accumulated), IDENTITY);

export const translationMatrix = (delta: Point): Matrix => ({
  ...IDENTITY,
  e: delta.x,
  f: delta.y,
});

export const rotationMatrix = (degrees: number, origin: Point = { x: 0, y: 0 }): Matrix => {
  const radians = degrees * DEGREES_TO_RADIANS;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: origin.x - origin.x * cos + origin.y * sin,
    f: origin.y - origin.x * sin - origin.y * cos,
  };
};

export const scaleMatrix = (
  scaleX: number,
  scaleY: number,
  origin: Point = { x: 0, y: 0 },
): Matrix => ({
  a: scaleX,
  b: 0,
  c: 0,
  d: scaleY,
  e: origin.x - origin.x * scaleX,
  f: origin.y - origin.y * scaleY,
});

export const applyMatrix = (matrix: Matrix, point: Point): Point => ({
  x: matrix.a * point.x + matrix.c * point.y + matrix.e,
  y: matrix.b * point.x + matrix.d * point.y + matrix.f,
});

/* ------------------------------------------------------------------ */
/* Shape-level transforms                                              */
/* ------------------------------------------------------------------ */

/**
 * Applies a matrix to a shape's stored geometry.
 *
 * The shape's own rotation is carried through untouched — this moves and scales
 * the geometry underneath it. A rectangle stays a rectangle, which is why
 * rotating one no longer changes its type.
 */
export const transformShape = <T extends ShapeData>(shape: T, matrix: Matrix): ShapeData => {
  switch (shape.type) {
    case 'point':
      return { ...shape, geometry: applyMatrix(matrix, shape.geometry) };
    case 'line':
      return {
        ...shape,
        geometry: {
          start: applyMatrix(matrix, shape.geometry.start),
          end: applyMatrix(matrix, shape.geometry.end),
        },
      };
    case 'polygon':
    case 'freehand':
      return {
        ...shape,
        geometry: { points: shape.geometry.points.map((point) => applyMatrix(matrix, point)) },
      };
    case 'rect': {
      const corners = rectCorners(shape.geometry).map((point) => applyMatrix(matrix, point));
      if (isAxisAligned(corners)) {
        return { ...shape, geometry: boundsOfPoints(corners) };
      }
      // A matrix that turns or shears a rectangle cannot be expressed as one,
      // so the geometry becomes a polygon. Rotation proper never lands here:
      // it sets the shape's angle instead.
      return { ...shape, type: 'polygon', geometry: { points: corners } } as ShapeData;
    }
    default:
      return shape;
  }
};

const isAxisAligned = (corners: readonly Point[], tolerance = 1e-9): boolean => {
  if (corners.length !== 4) return false;
  const [a, b, , d] = corners as [Point, Point, Point, Point];
  return Math.abs(a.y - b.y) < tolerance && Math.abs(a.x - d.x) < tolerance;
};

/**
 * Rotates a shape about a pivot, defaulting to its own centre.
 *
 * Sets the shape's angle rather than moving its points, which is what lets the
 * rotation be undone, re-edited, and shown by a handle that stays where the
 * user left it. Every shape type behaves the same way; a rectangle stays a
 * rectangle.
 *
 * Rotating about a pivot other than the centre also moves the shape, since the
 * centre itself travels around that pivot.
 */
export const rotateShape = <T extends ShapeData>(
  shape: T,
  degrees: number,
  pivot?: Point,
): ShapeData => {
  const rotated: ShapeData = {
    ...shape,
    rotation: normalizeAngle(shapeRotation(shape) + degrees),
  };

  if (!pivot) return rotated;

  const centre = shapePivot(shape);
  const moved = rotatePoint(centre, degrees, pivot);
  return transformShape(rotated, translationMatrix({ x: moved.x - centre.x, y: moved.y - centre.y }));
};

/** Scales a shape about a pivot, defaulting to its own centre. */
export const scaleShape = <T extends ShapeData>(
  shape: T,
  scaleX: number,
  scaleY: number,
  pivot?: Point,
): ShapeData => {
  const origin = pivot ?? shapeCenter(shape);
  return transformShape(shape, scaleMatrix(scaleX, scaleY, origin));
};

/**
 * Translates a shape, clamping the whole shape inside the canvas.
 *
 * The delta is reduced until the shape's bounds fit, so relative point
 * positions never change. Clamping each point independently — which is what
 * the editor used to do — distorts any shape dragged against an edge.
 */
export const translateShape = <T extends ShapeData>(
  shape: T,
  delta: Point,
  canvasSize?: CanvasSize,
): ShapeData => {
  if (!canvasSize) return transformShape(shape, translationMatrix(delta));

  const bounds = transformedBounds(shape);
  const maxX = Math.max(0, canvasSize.width - bounds.w);
  const maxY = Math.max(0, canvasSize.height - bounds.h);
  const clampedX = clamp(bounds.x + delta.x, 0, maxX) - bounds.x;
  const clampedY = clamp(bounds.y + delta.y, 0, maxY) - bounds.y;

  return transformShape(shape, translationMatrix({ x: clampedX, y: clampedY }));
};

/** Axis-aligned bounds of a shape, accounting for any rotation it carries. */
/** Axis-aligned bounds of the shape as drawn, rotation included. */
export const transformedBounds = (shape: ShapeData): RectGeometry => {
  if (shape.type === 'rect' && shapeRotation(shape) === 0) return normalizeRect(shape.geometry);
  return boundsOfPoints(pointsFor(shape));
};

/**
 * Projects any shape to an outline suitable for an SVG polygon.
 *
 * Standards adapters need this: no IIIF selector represents an oriented
 * rectangle, so a rotated shape has to serialize as a polygon. Exposing the
 * projection here means a host never has to read the editor's SVG to find out
 * where a shape actually is.
 */
export const toPolygonPoints = (shape: ShapeData): Point[] => pointsFor(shape);

/** Whether a point lies inside a shape's outline. */
export const outlineContainsPoint = (shape: ShapeData, point: Point): boolean => {
  const outline = toPolygonPoints(shape);
  if (outline.length < 3) return false;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i, i += 1) {
    const pi = outline[i] as Point;
    const pj = outline[j] as Point;
    const intersects =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
};

/** Angle from `origin` to `point`, in degrees, clockwise from the positive x axis. */
export const angleOf = (origin: Point, point: Point): number =>
  normalizeAngle(Math.atan2(point.y - origin.y, point.x - origin.x) / DEGREES_TO_RADIANS);

/**
 * Constrains a whole shape inside the canvas without changing its proportions.
 *
 * Only translates. A shape larger than the canvas is pinned to the top-left
 * rather than being shrunk, because shrinking would silently rewrite geometry
 * the user drew deliberately.
 */
export const constrainShape = <T extends ShapeData>(
  shape: T,
  canvasSize: CanvasSize,
): ShapeData => {
  const bounds = transformedBounds(shape);
  const maxX = Math.max(0, canvasSize.width - bounds.w);
  const maxY = Math.max(0, canvasSize.height - bounds.h);
  const dx = clamp(bounds.x, 0, maxX) - bounds.x;
  const dy = clamp(bounds.y, 0, maxY) - bounds.y;
  if (dx === 0 && dy === 0) return shape;
  return transformShape(shape, translationMatrix({ x: dx, y: dy }));
};
