import type { CanvasSize, OSDLikeViewer, Point } from './types';

/**
 * Rotation- and flip-aware conversion between image and viewer-element space.
 *
 * The previous implementation reimplemented OpenSeadragon's
 * `_pixelFromPointNoRotate` inline and preferred it over the viewport's own
 * API. That arithmetic is correct only at rotation 0: OpenSeadragon's real
 * `_pixelFromPoint` rotates the point about the viewport centre *before*
 * applying the same no-rotate transform, and the reimplementation omitted that
 * step. Because the numeric path succeeded whenever the private fields it read
 * were present — which in a real viewer is always — the rotation-aware API was
 * never reached and every annotation was misplaced at any non-zero rotation.
 *
 * This module inverts the preference: the viewport's documented conversions are
 * the only path, and the numeric approximation survives solely as a fallback
 * for environments that have no real viewport at all.
 */

/** The subset of `OpenSeadragon.Point` the viewport's conversions require. */
interface OSDPointLike {
  x: number;
  y: number;
}

/** Methods the viewport calls on any point handed to it. */
const REQUIRED_POINT_METHODS = ['rotate', 'minus', 'plus', 'times'] as const;

export interface CoordinateOptions {
  /**
   * Supplies a point the viewport will accept.
   *
   * The viewport's conversions call `.rotate()`, `.minus()`, `.plus()`, and
   * `.times()` on their argument, so a plain `{x, y}` cannot be passed in. By
   * default a prototype is borrowed from a live point the viewport hands back.
   * Pass this to bypass that — a host with OpenSeadragon in scope can supply
   * `(x, y) => new OpenSeadragon.Point(x, y)`.
   */
  pointFactory?: (x: number, y: number) => OSDPointLike;
}

const isFinitePoint = (value: unknown): value is OSDPointLike =>
  Boolean(value) &&
  typeof value === 'object' &&
  Number.isFinite((value as OSDPointLike).x) &&
  Number.isFinite((value as OSDPointLike).y);

/**
 * Borrows a point prototype from the viewport.
 *
 * Deliberately not via `constructor`: OpenSeadragon assigns an object literal
 * to `Point.prototype`, which resets `constructor` to `Object`, so every point
 * it hands back claims to be a plain object while carrying the real methods.
 * Taking the prototype directly sidesteps that entirely, and works however the
 * class is declared.
 *
 * Cached per viewport — the lookup is cheap, but it would otherwise run for
 * every projected coordinate of every frame.
 */
const pointPrototypes = new WeakMap<object, object | null>();

const isUsablePointPrototype = (value: unknown): value is object => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as Record<string, unknown> | null;
  if (!proto) return false;
  return REQUIRED_POINT_METHODS.every((method) => typeof proto[method] === 'function');
};

const resolvePointPrototype = (viewer: OSDLikeViewer): object | null => {
  const viewport = viewer.viewport as
    | {
        getCenter?: (current?: boolean) => unknown;
        getBounds?: (current?: boolean) => { getTopLeft?: () => unknown } | undefined;
        getContainerSize?: () => unknown;
      }
    | undefined;
  if (!viewport) return null;

  const cached = pointPrototypes.get(viewport as object);
  if (cached !== undefined) return cached;

  // Several sources, because a viewport mid-construction may not answer all of
  // them, and a host may supply a partial viewport.
  const candidates: Array<() => unknown> = [
    () => viewport.getCenter?.(true),
    () => viewport.getBounds?.(true)?.getTopLeft?.(),
    () => viewport.getContainerSize?.(),
  ];

  let prototype: object | null = null;
  for (const candidate of candidates) {
    let value: unknown;
    try {
      value = candidate();
    } catch {
      continue;
    }
    if (isFinitePoint(value) && isUsablePointPrototype(value)) {
      prototype = Object.getPrototypeOf(value) as object;
      break;
    }
  }

  pointPrototypes.set(viewport as object, prototype);
  return prototype;
};

const makePoint = (
  viewer: OSDLikeViewer,
  x: number,
  y: number,
  options?: CoordinateOptions,
): OSDPointLike | null => {
  if (options?.pointFactory) return options.pointFactory(x, y);
  const prototype = resolvePointPrototype(viewer);
  if (!prototype) return null;
  const point = Object.create(prototype) as OSDPointLike;
  point.x = x;
  point.y = y;
  return point;
};

/**
 * Whether the viewport is horizontally flipped.
 *
 * OpenSeadragon does not put flip into its coordinate maths — it applies
 * `scale(-1,1)` to the drawing surface at render time. An overlay drawing in
 * element space therefore has to mirror x itself, or it lands on the opposite
 * side of the image from the pixels it describes.
 */
const isFlipped = (viewer: OSDLikeViewer): boolean => {
  const viewport = viewer.viewport as
    | { getFlip?: () => boolean; flipped?: boolean }
    | undefined;
  if (!viewport) return false;
  if (typeof viewport.getFlip === 'function') return Boolean(viewport.getFlip());
  return Boolean(viewport.flipped);
};

/** Mirrors an element-space x about the container centre, matching the drawer. */
const mirrorX = (viewer: OSDLikeViewer, x: number): number => {
  const width = viewer.container.getBoundingClientRect().width;
  return Number.isFinite(width) ? width - x : x;
};

/**
 * Proportional fallback used only when there is no usable viewport.
 *
 * Test harnesses and headless environments construct the editor against a bare
 * container. Producing a plausible projection there keeps the editor
 * constructible; it is not, and cannot be, rotation-correct.
 */
const fallbackToElement = (viewer: OSDLikeViewer, point: Point, canvasSize: CanvasSize): Point => {
  const rect = viewer.container.getBoundingClientRect();
  return {
    x: (point.x / Math.max(1, canvasSize.width)) * rect.width,
    y: (point.y / Math.max(1, canvasSize.height)) * rect.height,
  };
};

const fallbackToImage = (viewer: OSDLikeViewer, point: Point, canvasSize: CanvasSize): Point => {
  const rect = viewer.container.getBoundingClientRect();
  return {
    x: (point.x / Math.max(1, rect.width)) * canvasSize.width,
    y: (point.y / Math.max(1, rect.height)) * canvasSize.height,
  };
};

/** Image pixel coordinates to viewer-element pixel coordinates. */
export const imageToElement = (
  viewer: OSDLikeViewer,
  point: Point,
  canvasSize: CanvasSize,
  options?: CoordinateOptions,
): Point => {
  const viewport = viewer.viewport as
    | { imageToViewerElementCoordinates?: (pixel: OSDPointLike) => unknown }
    | undefined;

  if (typeof viewport?.imageToViewerElementCoordinates === 'function') {
    const input = makePoint(viewer, point.x, point.y, options);
    if (input) {
      const projected = viewport.imageToViewerElementCoordinates(input);
      if (isFinitePoint(projected)) {
        const x = isFlipped(viewer) ? mirrorX(viewer, projected.x) : projected.x;
        return { x, y: projected.y };
      }
    }
  }

  return fallbackToElement(viewer, point, canvasSize);
};

/** Viewer-element pixel coordinates to image pixel coordinates. */
export const elementToImage = (
  viewer: OSDLikeViewer,
  point: Point,
  canvasSize: CanvasSize,
  options?: CoordinateOptions,
): Point => {
  const viewport = viewer.viewport as
    | { viewerElementToImageCoordinates?: (pixel: OSDPointLike) => unknown }
    | undefined;

  if (typeof viewport?.viewerElementToImageCoordinates === 'function') {
    // Undo the mirror before handing element coordinates back to the viewport,
    // which knows nothing about flip.
    const x = isFlipped(viewer) ? mirrorX(viewer, point.x) : point.x;
    const input = makePoint(viewer, x, point.y, options);
    if (input) {
      const converted = viewport.viewerElementToImageCoordinates(input);
      if (isFinitePoint(converted)) return { x: converted.x, y: converted.y };
    }
  }

  return fallbackToImage(viewer, point, canvasSize);
};

/**
 * Whether this viewer supports rotation-correct conversion.
 *
 * Exposed so a host can detect the degraded fallback rather than discovering it
 * through misplaced annotations.
 */
export const hasAccurateProjection = (
  viewer: OSDLikeViewer,
  options?: CoordinateOptions,
): boolean => {
  const viewport = viewer.viewport as
    | {
        imageToViewerElementCoordinates?: unknown;
        viewerElementToImageCoordinates?: unknown;
      }
    | undefined;
  if (typeof viewport?.imageToViewerElementCoordinates !== 'function') return false;
  if (typeof viewport?.viewerElementToImageCoordinates !== 'function') return false;
  return Boolean(options?.pointFactory) || resolvePointPrototype(viewer) !== null;
};
