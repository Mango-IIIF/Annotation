/*
 * Annotorious image targets <-> W3C image annotations with image-pixel / canvas-unit scaling,
 * plus point-marker helpers so point annotations work cleanly inside Annotorious.
 *
 * Annotorious works in image pixels; IIIF annotations target canvas coordinates.
 * The two match for most manifests, but not when the painted image's size differs
 * from the canvas's, so both directions scale.
 */

import { ShapeType, W3CImageFormat, type ImageAnnotation } from '@annotorious/openseadragon';
import type { Annotation } from './types';

type Geometry = Record<string, unknown> & {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  points?: number[][];
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  polygons?: number[][][][];
};

export type ImageTarget = ImageAnnotation['target'];

export const POINT_BODY_PURPOSE = 'mango:point';

/** Creates an Annotorious ellipse annotation representing a draggable point marker at `(x, y)`. */
export const createPointImageAnnotation = (
  id: string,
  x: number,
  y: number,
  radius = 12,
): ImageAnnotation =>
  ({
    id,
    bodies: [{ id: `${id}#point`, annotation: id, purpose: POINT_BODY_PURPOSE, value: 'point' }],
    target: {
      annotation: id,
      selector: {
        type: ShapeType.ELLIPSE,
        geometry: {
          cx: x,
          cy: y,
          rx: radius,
          ry: radius,
          bounds: {
            minX: x - radius,
            minY: y - radius,
            maxX: x + radius,
            maxY: y + radius,
          },
        },
      },
    },
  }) as unknown as ImageAnnotation;

/** True when an Annotorious `ImageAnnotation` represents a Mango point marker. */
export const isPointImageAnnotation = (annotation: ImageAnnotation): boolean =>
  Boolean(annotation.bodies?.some((body) => body.purpose === POINT_BODY_PURPOSE));

/** Returns the center `(x, y)` of a point-marker `ImageAnnotation`, or null if not a point. */
export const pointCenterOf = (annotation: ImageAnnotation): { x: number; y: number } | null => {
  if (!isPointImageAnnotation(annotation)) return null;
  const geom = annotation.target?.selector?.geometry as unknown as Geometry | undefined;
  if (!geom) return null;
  if (typeof geom.cx === 'number' && typeof geom.cy === 'number') {
    return { x: geom.cx, y: geom.cy };
  }
  const b = geom.bounds as { minX: number; minY: number; maxX: number; maxY: number } | undefined;
  if (b) return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  return null;
};

const scaleGeometry = (type: string, g: Geometry, sx: number, sy: number, round: boolean) => {
  const r = (n: number) => (round ? Math.round(n) : n);
  if (type === ShapeType.RECTANGLE) {
    Object.assign(g, { x: r(g.x! * sx), y: r(g.y! * sy), w: r(g.w! * sx), h: r(g.h! * sy) });
  } else if (type === ShapeType.POLYGON || type === 'POLYLINE' || type === 'LINE') {
    if (g.points) g.points = g.points.map(([x, y]) => [x * sx, y * sy]);
  } else if (type === ShapeType.ELLIPSE) {
    Object.assign(g, { cx: g.cx! * sx, cy: g.cy! * sy, rx: g.rx! * sx, ry: g.ry! * sy });
  } else if (type === ShapeType.MULTIPOLYGON && g.polygons) {
    g.polygons = g.polygons.map((polygon) =>
      polygon.map((ring) => ring.map(([x, y]) => [x * sx, y * sy])),
    );
  }
  const b = g.bounds as { minX: number; minY: number; maxX: number; maxY: number } | undefined;
  if (b) g.bounds = { minX: b.minX * sx, minY: b.minY * sy, maxX: b.maxX * sx, maxY: b.maxY * sy };
};

/** Copies a target, scaled, without the provenance Annotorious adds to it. */
export const scaleTarget = (target: ImageTarget, sx: number, sy: number, round = false): ImageTarget => {
  const { created: _c, updated: _u, creator: _cr, updatedBy: _ub, ...rest } = target as ImageTarget &
    Record<string, unknown>;
  const copy = structuredClone(rest) as ImageTarget;
  if (sx !== 1 || sy !== 1 || round) {
    scaleGeometry(copy.selector.type, copy.selector.geometry as unknown as Geometry, sx, sy, round);
  }
  return copy;
};

/**
 * A W3C annotation on `canvasId` as an Annotorious shape in image pixels, or
 * null when it has no supported selector (whole-canvas, time-based, ...).
 */
export const toImageAnnotation = (
  annotation: Annotation,
  canvasId: string,
  scale: { sx: number; sy: number } = { sx: 1, sy: 1 },
): ImageAnnotation | null => {
  try {
    const { parsed } = W3CImageFormat(canvasId).parse(annotation as never);
    if (!parsed?.target?.selector) return null;
    return {
      ...parsed,
      target: scaleTarget(parsed.target, 1 / scale.sx, 1 / scale.sy),
    } as ImageAnnotation;
  } catch {
    return null;
  }
};
