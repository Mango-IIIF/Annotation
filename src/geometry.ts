import type { CanvasSize, OrientedRectGeometry, Point, ShapeData } from './types';

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

/** The four corners of an oriented rectangle, clockwise from its top-left. */
export function orientedRectCorners(geometry: OrientedRectGeometry): Point[] {
  const { center, w, h, angle } = geometry;
  const halfW = w / 2;
  const halfH = h / 2;
  return [
    { x: center.x - halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y + halfH },
    { x: center.x - halfW, y: center.y + halfH },
  ].map((corner) => rotatePoint(corner, angle, center));
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
  if (annotation.type === 'rect') {
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

export function pointsFor(annotation: ShapeData): Point[] {
  if (annotation.type === 'rect') {
    const rect = normalizeRect(annotation.geometry);
    return [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h },
    ];
  }
  if (annotation.type === 'line') {
    return [annotation.geometry.start, annotation.geometry.end];
  }
  if (annotation.type === 'point') {
    return [annotation.geometry];
  }
  if (annotation.type === 'oriented-rect') {
    return orientedRectCorners(annotation.geometry);
  }
  return annotation.geometry.points;
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
  if (annotation.type === 'oriented-rect') {
    return {
      ...annotation,
      geometry: {
        ...annotation.geometry,
        center: {
          x: annotation.geometry.center.x + delta.x,
          y: annotation.geometry.center.y + delta.y,
        },
      },
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
  if (annotation.type === 'oriented-rect') {
    return annotation;
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

export function resizeRect(
  annotation: Extract<ShapeData, { type: 'rect' }>,
  handle: string,
  point: Point,
  canvasSize: CanvasSize,
  minSize: { width: number; height: number },
  lockAspect: boolean,
) {
  const rect = normalizeRect(annotation.geometry);
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  const aspect = rect.w / Math.max(1, rect.h);
  const next = constrainPoint(point, canvasSize);

  if (handle.includes('w')) left = Math.min(next.x, right - minSize.width);
  if (handle.includes('e')) right = Math.max(next.x, left + minSize.width);
  if (handle.includes('n')) top = Math.min(next.y, bottom - minSize.height);
  if (handle.includes('s')) bottom = Math.max(next.y, top + minSize.height);

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

  left = clamp(left, 0, canvasSize.width);
  right = clamp(right, 0, canvasSize.width);
  top = clamp(top, 0, canvasSize.height);
  bottom = clamp(bottom, 0, canvasSize.height);

  return {
    ...annotation,
    geometry: normalizeRect({
      x: left,
      y: top,
      w: right - left,
      h: bottom - top,
    }),
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
