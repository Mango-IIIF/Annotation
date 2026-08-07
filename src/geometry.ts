import type { CanvasSize, Point, RectGeometry, ShapeData } from './types';

export const DEGREES_TO_RADIANS = Math.PI / 180;

/** Rotates a point about an origin. Positive degrees turn clockwise on screen. */
export function rotatePoint(point: Point, degrees: number, origin: Point): Point {
  const radians = degrees * DEGREES_TO_RADIANS;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/** A shape's rotation in degrees, zero when it carries none. */
export function shapeRotation(shape: ShapeData): number {
  const rotation = shape.rotation;
  return typeof rotation === 'number' && Number.isFinite(rotation) ? rotation : 0;
}

/** Corners of an axis-aligned rectangle, clockwise from its top-left. */
export function rectCorners(rect: RectGeometry): Point[] {
  const normalized = normalizeRect(rect);
  return [
    { x: normalized.x, y: normalized.y },
    { x: normalized.x + normalized.w, y: normalized.y },
    { x: normalized.x + normalized.w, y: normalized.y + normalized.h },
    { x: normalized.x, y: normalized.y + normalized.h },
  ];
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeRect(rect: { x: number; y: number; w: number; h: number }) {
  const x = rect.w < 0 ? rect.x + rect.w : rect.x;
  const y = rect.h < 0 ? rect.y + rect.h : rect.y;
  return {
    x,
    y,
    w: Math.abs(rect.w),
    h: Math.abs(rect.h),
  };
}

export function constrainPoint(point: Point, canvasSize: CanvasSize): Point {
  return {
    x: clamp(point.x, 0, canvasSize.width),
    y: clamp(point.y, 0, canvasSize.height),
  };
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function boundsFor(annotation: ShapeData) {
  if (annotation.type === 'rect' && shapeRotation(annotation) === 0) {
    return normalizeRect(annotation.geometry);
  }
  const points = pointsFor(annotation);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
}

/**
 * The shape's points as stored, before any rotation is applied.
 *
 * Use this for anything that has to survive a rotation unchanged — the pivot,
 * a resize in the shape's own frame, or writing geometry back.
 */
export function basePoints(annotation: ShapeData): Point[] {
  if (annotation.type === 'rect') return rectCorners(annotation.geometry);
  if (annotation.type === 'line') return [annotation.geometry.start, annotation.geometry.end];
  if (annotation.type === 'point') return [annotation.geometry];
  return annotation.geometry.points;
}

/**
 * The shape's outline as drawn, with its rotation applied.
 *
 * This is what rendering, hit testing, and a standards adapter all want: where
 * the shape actually is on the canvas.
 */
export function pointsFor(annotation: ShapeData): Point[] {
  const points = basePoints(annotation);
  const rotation = shapeRotation(annotation);
  if (rotation === 0) return points;

  const pivot = shapePivot(annotation);
  return points.map((point) => rotatePoint(point, rotation, pivot));
}

/**
 * The point a shape rotates about: the centre of its unrotated bounds.
 *
 * Deliberately computed from the stored geometry rather than from the drawn
 * outline. Rotating a shape that is not symmetrical moves the bounding box of
 * its outline, so a pivot derived from that would drift a little further on
 * every rotation instead of staying put.
 */
export function shapePivot(annotation: ShapeData): Point {
  if (annotation.type === 'point') return { ...annotation.geometry };
  if (annotation.type === 'rect') {
    const rect = normalizeRect(annotation.geometry);
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  }

  const points = basePoints(annotation);
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
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function translateAnnotation<T extends ShapeData>(
  annotation: T,
  delta: Point,
  canvasSize: CanvasSize,
): T {
  if (annotation.type === 'rect') {
    const rect = normalizeRect(annotation.geometry);
    return {
      ...annotation,
      geometry: {
        ...rect,
        x: clamp(rect.x + delta.x, 0, Math.max(0, canvasSize.width - rect.w)),
        y: clamp(rect.y + delta.y, 0, Math.max(0, canvasSize.height - rect.h)),
      },
    };
  }
  if (annotation.type === 'point') {
    return {
      ...annotation,
      geometry: constrainPoint(
        { x: annotation.geometry.x + delta.x, y: annotation.geometry.y + delta.y },
        canvasSize,
      ),
    };
  }
  if (annotation.type === 'line') {
    return {
      ...annotation,
      geometry: {
        start: constrainPoint(
          {
            x: annotation.geometry.start.x + delta.x,
            y: annotation.geometry.start.y + delta.y,
          },
          canvasSize,
        ),
        end: constrainPoint(
          {
            x: annotation.geometry.end.x + delta.x,
            y: annotation.geometry.end.y + delta.y,
          },
          canvasSize,
        ),
      },
    };
  }
  return {
    ...annotation,
    geometry: {
      points: annotation.geometry.points.map((point) =>
        constrainPoint({ x: point.x + delta.x, y: point.y + delta.y }, canvasSize),
      ),
    },
  };
}

export function updateVertex<T extends ShapeData>(
  annotation: T,
  vertexIndex: number,
  point: Point,
  canvasSize: CanvasSize,
): T {
  const nextPoint = constrainPoint(point, canvasSize);
  if (annotation.type === 'point') {
    return { ...annotation, geometry: nextPoint };
  }
  if (annotation.type === 'line') {
    return {
      ...annotation,
      geometry:
        vertexIndex === 0
          ? { ...annotation.geometry, start: nextPoint }
          : { ...annotation.geometry, end: nextPoint },
    };
  }
  if (annotation.type === 'polygon' || annotation.type === 'freehand') {
    return {
      ...annotation,
      geometry: {
        points: annotation.geometry.points.map((existing, index) =>
          index === vertexIndex ? nextPoint : existing,
        ),
      },
    };
  }
  return annotation;
}

/**
 * Resizes a rectangle by dragging one of its handles.
 *
 * When the rectangle carries a rotation, the work happens in its own frame:
 * the pointer is rotated back by the shape's angle, the edges move as they
 * would for an upright rectangle, and the resulting centre is rotated forward
 * again so the opposite edge stays where the user can see it. Resizing in
 * screen space would shear the shape, because a handle on a turned rectangle
 * is not moving along a screen axis.
 */
export function resizeRect(
  annotation: Extract<ShapeData, { type: 'rect' }>,
  handle: string,
  point: Point,
  canvasSize: CanvasSize,
  minSize: { width: number; height: number },
  lockAspect: boolean,
) {
  const rotation = shapeRotation(annotation);
  const rect = normalizeRect(annotation.geometry);
  const pivot = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };

  // Into the rectangle's own frame, and clamp to the canvas only when upright:
  // a rotated rectangle's local axes do not line up with the canvas edges, so
  // clamping there would distort it.
  const local = rotation === 0 ? constrainPoint(point, canvasSize) : rotatePoint(point, -rotation, pivot);

  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  const aspect = rect.w / Math.max(1, rect.h);

  if (handle.includes('w')) left = Math.min(local.x, right - minSize.width);
  if (handle.includes('e')) right = Math.max(local.x, left + minSize.width);
  if (handle.includes('n')) top = Math.min(local.y, bottom - minSize.height);
  if (handle.includes('s')) bottom = Math.max(local.y, top + minSize.height);

  if (lockAspect && handle.length === 2) {
    const width = right - left;
    const height = bottom - top;
    if (width / Math.max(1, height) > aspect) {
      const adjusted = width / aspect;
      if (handle.includes('n')) top = bottom - adjusted;
      else bottom = top + adjusted;
    } else {
      const adjusted = height * aspect;
      if (handle.includes('w')) left = right - adjusted;
      else right = left + adjusted;
    }
  }

  if (rotation === 0) {
    left = clamp(left, 0, canvasSize.width);
    right = clamp(right, 0, canvasSize.width);
    top = clamp(top, 0, canvasSize.height);
    bottom = clamp(bottom, 0, canvasSize.height);
    return {
      ...annotation,
      geometry: normalizeRect({ x: left, y: top, w: right - left, h: bottom - top }),
    };
  }

  const width = Math.max(minSize.width, right - left);
  const height = Math.max(minSize.height, bottom - top);
  // The new centre in the local frame, carried back into world space so the
  // anchored edge does not appear to move.
  const localCentre = { x: left + width / 2, y: top + height / 2 };
  const worldCentre = rotatePoint(localCentre, rotation, pivot);

  return {
    ...annotation,
    geometry: {
      x: worldCentre.x - width / 2,
      y: worldCentre.y - height / 2,
      w: width,
      h: height,
    },
  };
}

export function snapLinePoint(start: Point, end: Point, degrees = 15): Point {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const snap = (degrees * Math.PI) / 180;
  const snappedAngle = Math.round(angle / snap) * snap;
  const length = distance(start, end);
  return {
    x: start.x + Math.cos(snappedAngle) * length,
    y: start.y + Math.sin(snappedAngle) * length,
  };
}

export function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2 || tolerance <= 0) return points;
  const sqTolerance = tolerance * tolerance;

  const sqSegDist = (point: Point, start: Point, end: Point) => {
    let x = start.x;
    let y = start.y;
    let dx = end.x - x;
    let dy = end.y - y;
    if (dx !== 0 || dy !== 0) {
      const t = clamp(
        ((point.x - x) * dx + (point.y - y) * dy) / (dx * dx + dy * dy),
        0,
        1,
      );
      x += dx * t;
      y += dy * t;
    }
    dx = point.x - x;
    dy = point.y - y;
    return dx * dx + dy * dy;
  };

  const simplifyDPStep = (first: number, last: number, simplified: Point[]) => {
    let maxSqDist = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const sqDist = sqSegDist(points[i], points[first], points[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (index > -1) {
      if (index - first > 1) simplifyDPStep(first, index, simplified);
      simplified.push(points[index]);
      if (last - index > 1) simplifyDPStep(index, last, simplified);
    }
  };

  const simplified = [points[0]];
  simplifyDPStep(0, points.length - 1, simplified);
  simplified.push(points[points.length - 1]);
  return simplified;
}

/** Signed area of a polygon; the sign tells you its winding direction. */
export function polygonArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  let total = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[j] as Point;
    const b = points[i] as Point;
    total += (a.x - b.x) * (a.y + b.y);
  }
  return Math.abs(total / 2);
}

/** Total length of an open path. */
export function pathLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1] as Point, points[index] as Point);
  }
  return total;
}

/** Distance from a point to a segment, and where along it the nearest point lies. */
export function projectOntoSegment(
  point: Point,
  start: Point,
  end: Point,
): { distance: number; t: number; point: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return { distance: distance(point, start), t: 0, point: start };
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const nearest = { x: start.x + t * dx, y: start.y + t * dy };
  return { distance: distance(point, nearest), t, point: nearest };
}

/**
 * The segment of a path nearest a point.
 *
 * Used to decide where a new vertex goes when a user clicks an edge. Returns
 * the index of the segment's *end* vertex, which is the insertion position.
 */
export function nearestSegment(
  points: readonly Point[],
  point: Point,
  closed: boolean,
): { index: number; distance: number; point: Point } | null {
  if (points.length < 2) return null;

  let best: { index: number; distance: number; point: Point } | null = null;
  const last = closed ? points.length : points.length - 1;

  for (let index = 0; index < last; index += 1) {
    const start = points[index] as Point;
    const end = points[(index + 1) % points.length] as Point;
    const projected = projectOntoSegment(point, start, end);
    if (!best || projected.distance < best.distance) {
      best = { index: index + 1, distance: projected.distance, point: projected.point };
    }
  }
  return best;
}

/** Inserts a vertex into a polygon or freehand path. */
export function insertVertex<T extends ShapeData>(annotation: T, index: number, point: Point): T {
  if (annotation.type !== 'polygon' && annotation.type !== 'freehand') return annotation;
  const points = [...annotation.geometry.points];
  points.splice(clamp(index, 0, points.length), 0, point);
  return { ...annotation, geometry: { points } };
}

/**
 * Removes a vertex, refusing to take a shape below its valid minimum.
 *
 * A polygon needs three points and a path needs two. Allowing the removal
 * would leave geometry that cannot be rendered or serialized.
 */
export function removeVertex<T extends ShapeData>(annotation: T, index: number): T {
  if (annotation.type !== 'polygon' && annotation.type !== 'freehand') return annotation;
  const minimum = annotation.type === 'polygon' ? 3 : 2;
  if (annotation.geometry.points.length <= minimum) return annotation;

  const points = annotation.geometry.points.filter((_point, position) => position !== index);
  return { ...annotation, geometry: { points } };
}

/** Applies rectangle drawing constraints: square, and drawn from the centre. */
export function constrainDrawnRect(
  start: Point,
  end: Point,
  options: { square?: boolean; fromCenter?: boolean },
): { x: number; y: number; w: number; h: number } {
  let dx = end.x - start.x;
  let dy = end.y - start.y;

  if (options.square) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * size;
    dy = Math.sign(dy || 1) * size;
  }

  if (options.fromCenter) {
    return normalizeRect({ x: start.x - dx, y: start.y - dy, w: dx * 2, h: dy * 2 });
  }
  return normalizeRect({ x: start.x, y: start.y, w: dx, h: dy });
}

/**
 * The eight resize handles of a shape, positioned on its rotated outline.
 *
 * Named by their direction in the shape's own frame, so `e` is the edge that
 * grows when the shape gets wider whichever way it happens to be turned.
 */
export function resizeHandlesFor(annotation: ShapeData): Array<[string, Point]> {
  if (annotation.type !== 'rect') return [];

  const rect = normalizeRect(annotation.geometry);
  const rotation = shapeRotation(annotation);
  const pivot = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };

  const local: Array<[string, Point]> = [
    ['nw', { x: rect.x, y: rect.y }],
    ['n', { x: rect.x + rect.w / 2, y: rect.y }],
    ['ne', { x: rect.x + rect.w, y: rect.y }],
    ['e', { x: rect.x + rect.w, y: rect.y + rect.h / 2 }],
    ['se', { x: rect.x + rect.w, y: rect.y + rect.h }],
    ['s', { x: rect.x + rect.w / 2, y: rect.y + rect.h }],
    ['sw', { x: rect.x, y: rect.y + rect.h }],
    ['w', { x: rect.x, y: rect.y + rect.h / 2 }],
  ];

  if (rotation === 0) return local;
  return local.map(([name, point]) => [name, rotatePoint(point, rotation, pivot)]);
}
