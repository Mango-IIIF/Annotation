import { describe, expect, it } from 'vitest';
import {
  angleOf,
  applyMatrix,
  boundsOfPoints,
  centroid,
  compose,
  constrainShape,
  IDENTITY,
  normalizeAngle,
  orientedRectCorners,
  outlineContainsPoint,
  rotatePoint,
  rotateShape,
  rotationMatrix,
  scaleShape,
  shapeCenter,
  signedAngle,
  snapAngle,
  snapAngleWithCardinals,
  toAxisAlignedRect,
  toOrientedRect,
  toPolygonPoints,
  transformedBounds,
  transformShape,
  translateShape,
  translationMatrix,
} from '../src/transform';
import type { Point, ShapeData } from '../src/types';

const closeTo = (actual: Point, expected: Point, digits = 9) => {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
};

const rect: ShapeData = { id: 'r', type: 'rect', geometry: { x: 10, y: 20, w: 40, h: 20 } };
const polygon: ShapeData = {
  id: 'p',
  type: 'polygon',
  geometry: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
};

describe('angles', () => {
  it('normalizes to [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(-450)).toBe(270);
    expect(normalizeAngle(Number.NaN)).toBe(0);
  });

  it('gives the shortest signed turn', () => {
    expect(signedAngle(0)).toBe(0);
    expect(signedAngle(90)).toBe(90);
    expect(signedAngle(180)).toBe(180);
    expect(signedAngle(181)).toBe(-179);
    expect(signedAngle(270)).toBe(-90);
    expect(signedAngle(-10)).toBe(-10);
  });

  it('snaps to an increment', () => {
    expect(snapAngle(7, 15)).toBe(0);
    expect(snapAngle(8, 15)).toBe(15);
    expect(snapAngle(97, 15)).toBe(90);
    // A non-positive increment means no snapping rather than a divide by zero.
    expect(snapAngle(37, 0)).toBe(37);
  });

  it('pulls toward cardinals inside the tolerance', () => {
    expect(snapAngleWithCardinals(2, 15)).toBe(0);
    expect(snapAngleWithCardinals(88, 15)).toBe(90);
    expect(snapAngleWithCardinals(272, 15)).toBe(270);
    expect(snapAngleWithCardinals(358, 15)).toBe(0);
    // Outside the cardinal tolerance it falls back to the plain increment.
    expect(snapAngleWithCardinals(40, 15)).toBe(45);
  });

  it('measures the angle between two points clockwise from +x', () => {
    expect(angleOf({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
    expect(angleOf({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(angleOf({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180);
    expect(angleOf({ x: 0, y: 0 }, { x: 0, y: -1 })).toBeCloseTo(270);
  });
});

describe('point transforms', () => {
  it('rotates clockwise on screen for positive degrees', () => {
    // Screen y grows downward, so +x rotated by +90 points down.
    closeTo(rotatePoint({ x: 1, y: 0 }, 90, { x: 0, y: 0 }), { x: 0, y: 1 });
    closeTo(rotatePoint({ x: 0, y: 1 }, 90, { x: 0, y: 0 }), { x: -1, y: 0 });
  });

  it('returns to the original after four 90° turns', () => {
    let point: Point = { x: 137, y: 613 };
    const origin = { x: 40, y: 40 };
    for (let turn = 0; turn < 4; turn += 1) point = rotatePoint(point, 90, origin);
    closeTo(point, { x: 137, y: 613 });
  });

  it('returns to the original after rotating and inversely rotating', () => {
    const origin = { x: 12, y: -8 };
    const rotated = rotatePoint({ x: 5, y: 9 }, 33.7, origin);
    closeTo(rotatePoint(rotated, -33.7, origin), { x: 5, y: 9 });
  });

  it('computes a centroid and bounds', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }])).toEqual({
      x: 2,
      y: 2,
    });
    expect(centroid([])).toEqual({ x: 0, y: 0 });
    expect(boundsOfPoints([{ x: 3, y: 9 }, { x: -1, y: 2 }])).toEqual({ x: -1, y: 2, w: 4, h: 7 });
  });
});

describe('matrices', () => {
  it('leaves a point untouched under identity', () => {
    closeTo(applyMatrix(IDENTITY, { x: 3, y: 4 }), { x: 3, y: 4 });
  });

  it('composes left to right', () => {
    const move = translationMatrix({ x: 10, y: 0 });
    const turn = rotationMatrix(90, { x: 0, y: 0 });

    // Translate first, then rotate.
    closeTo(applyMatrix(compose(move, turn), { x: 0, y: 0 }), { x: 0, y: 10 });
    // Rotate first, then translate.
    closeTo(applyMatrix(compose(turn, move), { x: 0, y: 0 }), { x: 10, y: 0 });
  });

  it('agrees with rotatePoint', () => {
    const origin = { x: 7, y: 11 };
    const point = { x: 19, y: 3 };
    closeTo(applyMatrix(rotationMatrix(41, origin), point), rotatePoint(point, 41, origin));
  });
});

describe('shape transforms', () => {
  it('finds a shape centre', () => {
    expect(shapeCenter(rect)).toEqual({ x: 30, y: 30 });
    expect(shapeCenter(polygon)).toEqual({ x: 5, y: 5 });
    expect(shapeCenter({ id: 'x', type: 'point', geometry: { x: 4, y: 9 } })).toEqual({
      x: 4,
      y: 9,
    });
  });

  it('turns a rotated rectangle into an oriented rect, not a silent lie', () => {
    const rotated = rotateShape(rect, 30);
    expect(rotated.type).toBe('oriented-rect');
    if (rotated.type !== 'oriented-rect') return;

    expect(rotated.geometry.angle).toBeCloseTo(30);
    expect(rotated.geometry.w).toBeCloseTo(40);
    expect(rotated.geometry.h).toBeCloseTo(20);
    // Rotating about its own centre leaves the centre where it was.
    closeTo(rotated.geometry.center, { x: 30, y: 30 });
  });

  it('compounds successive rotations rather than stacking wrappers', () => {
    const once = rotateShape(rect, 30);
    const twice = rotateShape(once, 30);
    expect(twice.type).toBe('oriented-rect');
    if (twice.type !== 'oriented-rect') return;
    expect(twice.geometry.angle).toBeCloseTo(60);
  });

  it('rotates a polygon point by point', () => {
    const rotated = rotateShape(polygon, 90);
    expect(rotated.type).toBe('polygon');
    if (rotated.type !== 'polygon') return;
    // A square turned about its centre occupies the same region.
    expect(boundsOfPoints(rotated.geometry.points).w).toBeCloseTo(10);
    expect(boundsOfPoints(rotated.geometry.points).h).toBeCloseTo(10);
  });

  it('keeps relative point positions when constrained', () => {
    // Dragged hard past the top-left corner. Clamping each point separately
    // would flatten the shape against the edge; the whole shape must move.
    const moved = translateShape(polygon, { x: -500, y: -500 }, { width: 100, height: 100 });
    expect(moved.type).toBe('polygon');
    if (moved.type !== 'polygon') return;

    const bounds = boundsOfPoints(moved.geometry.points);
    expect(bounds.x).toBeCloseTo(0);
    expect(bounds.y).toBeCloseTo(0);
    expect(bounds.w).toBeCloseTo(10);
    expect(bounds.h).toBeCloseTo(10);
  });

  it('keeps a rotated rectangle rigid against a canvas edge', () => {
    const rotated = rotateShape(rect, 45);
    const moved = translateShape(rotated, { x: -1000, y: -1000 }, { width: 200, height: 200 });
    expect(moved.type).toBe('oriented-rect');
    if (moved.type !== 'oriented-rect') return;

    // Size and angle survive the constraint; only the centre moved.
    expect(moved.geometry.w).toBeCloseTo(40);
    expect(moved.geometry.h).toBeCloseTo(20);
    expect(moved.geometry.angle).toBeCloseTo(45);
    expect(transformedBounds(moved).x).toBeCloseTo(0);
    expect(transformedBounds(moved).y).toBeCloseTo(0);
  });

  it('pins an oversized shape rather than shrinking it', () => {
    const huge: ShapeData = { id: 'h', type: 'rect', geometry: { x: 50, y: 50, w: 400, h: 400 } };
    const constrained = constrainShape(huge, { width: 100, height: 100 });
    expect(transformedBounds(constrained)).toMatchObject({ x: 0, y: 0, w: 400, h: 400 });
  });

  it('scales about a pivot', () => {
    const scaled = scaleShape(polygon, 2, 2, { x: 0, y: 0 });
    expect(scaled.type).toBe('polygon');
    if (scaled.type !== 'polygon') return;
    expect(boundsOfPoints(scaled.geometry.points)).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });

  it('degrades a sheared rectangle to a polygon rather than lying about it', () => {
    const sheared = transformShape(rect, { a: 1, b: 0.5, c: 0, d: 1, e: 0, f: 0 });
    expect(sheared.type).toBe('polygon');
  });

  it('keeps an axis-aligned rectangle a rectangle under translation', () => {
    const moved = transformShape(rect, translationMatrix({ x: 5, y: 5 }));
    expect(moved.type).toBe('rect');
    expect(moved.geometry).toMatchObject({ x: 15, y: 25, w: 40, h: 20 });
  });
});

describe('oriented rectangles', () => {
  it('reports four corners clockwise from the top-left', () => {
    const corners = orientedRectCorners({ center: { x: 0, y: 0 }, w: 20, h: 10, angle: 0 });
    closeTo(corners[0]!, { x: -10, y: -5 });
    closeTo(corners[1]!, { x: 10, y: -5 });
    closeTo(corners[2]!, { x: 10, y: 5 });
    closeTo(corners[3]!, { x: -10, y: 5 });
  });

  it('swaps width and height at 90°', () => {
    const bounds = boundsOfPoints(
      orientedRectCorners({ center: { x: 0, y: 0 }, w: 20, h: 10, angle: 90 }),
    );
    expect(bounds.w).toBeCloseTo(10);
    expect(bounds.h).toBeCloseTo(20);
  });

  it('round-trips to and from an axis-aligned rectangle at right angles', () => {
    const oriented = toOrientedRect({ x: 10, y: 20, w: 40, h: 20 });
    expect(oriented.angle).toBe(0);
    expect(toAxisAlignedRect(oriented)).toMatchObject({ x: 10, y: 20, w: 40, h: 20 });

    const quarter = { ...oriented, angle: 90 };
    expect(toAxisAlignedRect(quarter)).toMatchObject({ w: 20, h: 40 });
  });

  it('refuses to flatten an arbitrary angle to a bounding box', () => {
    // Substituting the bounding box would silently enlarge the annotation.
    expect(toAxisAlignedRect({ center: { x: 0, y: 0 }, w: 20, h: 10, angle: 33 })).toBeNull();
  });

  it('projects to an outline a standards adapter can serialize', () => {
    const rotated = rotateShape(rect, 45);
    const outline = toPolygonPoints(rotated);
    expect(outline).toHaveLength(4);
    for (const point of outline) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('hit-tests against rotated geometry, not its bounding box', () => {
    const rotated = rotateShape(
      { id: 'r', type: 'rect', geometry: { x: -50, y: -10, w: 100, h: 20 } },
      45,
    );
    // The centre is inside at any angle.
    expect(outlineContainsPoint(rotated, { x: 0, y: 0 })).toBe(true);
    // A bounding-box test would wrongly include this corner.
    const bounds = transformedBounds(rotated);
    const corner = { x: bounds.x + 1, y: bounds.y + 1 };
    expect(outlineContainsPoint(rotated, corner)).toBe(false);
  });
});
