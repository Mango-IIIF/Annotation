import { describe, expect, it } from 'vitest';
import OpenSeadragon from 'openseadragon';
import { elementToImage, hasAccurateProjection, imageToElement } from '../src/coordinates';
import type { CanvasSize, OSDLikeViewer, Point } from '../src/types';

/**
 * Rotation and flip correctness, tested against a real OpenSeadragon viewport.
 *
 * A hand-rolled fake would only prove the code agrees with itself, and agreeing
 * with itself is precisely what the previous implementation did while placing
 * every annotation in the wrong position. `OpenSeadragon.Viewport` is pure
 * geometry with no canvas or tile loading, so it runs unmodified under jsdom.
 */

const CONTAINER: CanvasSize = { width: 1000, height: 800 };
const IMAGE: CanvasSize = { width: 1000, height: 800 };

/**
 * A real `OpenSeadragon.Viewport` with the smallest viewer stub that lets its
 * rotation path run. `rotateTo` returns early without `viewer.drawer.canRotate`,
 * so a bare viewport silently ignores every rotation — which would make this
 * whole suite pass against broken code.
 */
const createViewer = (
  options: { rotation?: number; flipped?: boolean; container?: CanvasSize } = {},
): OSDLikeViewer => {
  const size = options.container ?? CONTAINER;
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
      width: size.width,
      height: size.height,
      toJSON: () => ({}),
    }),
  });

  const viewport = new OpenSeadragon.Viewport({
    containerSize: new OpenSeadragon.Point(size.width, size.height),
    contentSize: new OpenSeadragon.Point(IMAGE.width, IMAGE.height),
    margins: { left: 0, top: 0, right: 0, bottom: 0 },
    springStiffness: 100,
    animationTime: 0,
  } as unknown as OpenSeadragon.ViewportOptions);

  (viewport as unknown as { viewer: unknown }).viewer = {
    drawer: { canRotate: () => true },
    raiseEvent: () => {},
    forceRedraw: () => {},
    world: {
      getItemCount: () => 0,
      getHomeBounds: () => new OpenSeadragon.Rect(0, 0, 1, IMAGE.height / IMAGE.width),
      getContentFactor: () => IMAGE.width,
    },
  };

  viewport.resetContentSize(new OpenSeadragon.Point(IMAGE.width, IMAGE.height));
  viewport.goHome(true);
  viewport.update();

  if (options.rotation) {
    viewport.setRotation(options.rotation, true);
    viewport.update();
  }
  if (options.flipped) viewport.setFlip(true);

  return { container, viewport } as unknown as OSDLikeViewer;
};

const toElement = (viewer: OSDLikeViewer, point: Point) => imageToElement(viewer, point, IMAGE);
const toImage = (viewer: OSDLikeViewer, point: Point) => elementToImage(viewer, point, IMAGE);

const CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 800 },
  { x: 0, y: 800 },
  { x: 500, y: 400 },
  { x: 137, y: 613 },
];

const ANGLES = [0, 90, 180, 270, 15, 33, 315];

describe('rotation-correct projection', () => {
  it('reports that a real viewport supports accurate projection', () => {
    expect(hasAccurateProjection(createViewer())).toBe(true);
  });

  for (const rotation of ANGLES) {
    it(`round-trips image coordinates at ${rotation}°`, () => {
      const viewer = createViewer({ rotation });
      for (const point of CORNERS) {
        const back = toImage(viewer, toElement(viewer, point));
        expect(back.x, `x at ${rotation}°`).toBeCloseTo(point.x, 6);
        expect(back.y, `y at ${rotation}°`).toBeCloseTo(point.y, 6);
      }
    });
  }

  for (const rotation of ANGLES) {
    it(`agrees with the viewport's own conversion at ${rotation}°`, () => {
      const viewer = createViewer({ rotation });
      const viewport = viewer.viewport as OpenSeadragon.Viewport;

      for (const point of CORNERS) {
        const expected = viewport.imageToViewerElementCoordinates(
          new OpenSeadragon.Point(point.x, point.y),
        );
        const actual = toElement(viewer, point);
        expect(actual.x).toBeCloseTo(expected.x, 6);
        expect(actual.y).toBeCloseTo(expected.y, 6);
      }
    });
  }

  it('places the image origin differently at 0° and 90°', () => {
    // The regression guard. The previous implementation ignored rotation
    // entirely, so these two were identical and annotations stayed put while
    // the image turned underneath them.
    const unrotated = toElement(createViewer({ rotation: 0 }), { x: 0, y: 0 });
    const rotated = toElement(createViewer({ rotation: 90 }), { x: 0, y: 0 });

    const moved = Math.hypot(rotated.x - unrotated.x, rotated.y - unrotated.y);
    expect(moved).toBeGreaterThan(100);
  });

  it('rotates a square image about the container centre at 90°', () => {
    const viewer = createViewer({ rotation: 90, container: { width: 800, height: 800 } });
    const centre = toElement(viewer, { x: 500, y: 400 });
    // Whatever the rotation, the image centre stays at the container centre.
    expect(centre.x).toBeCloseTo(400, 4);
    expect(centre.y).toBeCloseTo(400, 4);
  });

  it('does not accumulate drift of its own across a full circle', () => {
    // OpenSeadragon does not restore its exact pan after a full rotation — its
    // own constraints shift it by a few pixels — so comparing before and after
    // would be testing OpenSeadragon. What this package owns is that its
    // projection still matches the viewport's at every step of the way.
    const viewer = createViewer();
    const viewport = viewer.viewport as OpenSeadragon.Viewport;
    const sample = { x: 137, y: 613 };

    for (const angle of [90, 180, 270, 360, 450]) {
      viewport.setRotation(angle, true);
      viewport.update();

      const expected = viewport.imageToViewerElementCoordinates(
        new OpenSeadragon.Point(sample.x, sample.y),
      );
      const actual = toElement(viewer, sample);
      expect(actual.x, `x after ${angle}°`).toBeCloseTo(expected.x, 6);
      expect(actual.y, `y after ${angle}°`).toBeCloseTo(expected.y, 6);
    }
  });

  it('keeps a pointer on the vertex it was placed on, at every angle', () => {
    for (const rotation of ANGLES) {
      const viewer = createViewer({ rotation });
      const vertex = { x: 250, y: 300 };
      const rendered = toElement(viewer, vertex);
      // A pointer landing on the rendered vertex must resolve back to it.
      const resolved = toImage(viewer, rendered);
      expect(Math.hypot(resolved.x - vertex.x, resolved.y - vertex.y)).toBeLessThan(1e-6);
    }
  });
});

describe('flip', () => {
  it('mirrors element x when the viewport is flipped', () => {
    const plain = createViewer();
    const flipped = createViewer({ flipped: true });

    const point = { x: 250, y: 300 };
    const unflippedX = toElement(plain, point).x;
    const flippedX = toElement(flipped, point).x;

    expect(flippedX).toBeCloseTo(CONTAINER.width - unflippedX, 6);
    // Flip is horizontal only.
    expect(toElement(flipped, point).y).toBeCloseTo(toElement(plain, point).y, 6);
  });

  it('round-trips while flipped', () => {
    const viewer = createViewer({ flipped: true });
    for (const point of CORNERS) {
      const back = toImage(viewer, toElement(viewer, point));
      expect(back.x).toBeCloseTo(point.x, 6);
      expect(back.y).toBeCloseTo(point.y, 6);
    }
  });

  it('round-trips while flipped and rotated together', () => {
    for (const rotation of ANGLES) {
      const viewer = createViewer({ rotation, flipped: true });
      for (const point of CORNERS) {
        const back = toImage(viewer, toElement(viewer, point));
        expect(back.x, `x at ${rotation}° flipped`).toBeCloseTo(point.x, 6);
        expect(back.y, `y at ${rotation}° flipped`).toBeCloseTo(point.y, 6);
      }
    }
  });
});

describe('non-square viewers', () => {
  it('round-trips in a viewer wider than it is tall', () => {
    for (const rotation of ANGLES) {
      const viewer = createViewer({ rotation, container: { width: 1600, height: 500 } });
      for (const point of CORNERS) {
        const back = toImage(viewer, toElement(viewer, point));
        expect(back.x).toBeCloseTo(point.x, 5);
        expect(back.y).toBeCloseTo(point.y, 5);
      }
    }
  });

  it('round-trips in a viewer taller than it is wide', () => {
    for (const rotation of ANGLES) {
      const viewer = createViewer({ rotation, container: { width: 480, height: 1200 } });
      for (const point of CORNERS) {
        const back = toImage(viewer, toElement(viewer, point));
        expect(back.x).toBeCloseTo(point.x, 5);
        expect(back.y).toBeCloseTo(point.y, 5);
      }
    }
  });
});

describe('degraded environments', () => {
  it('falls back proportionally when there is no viewport', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1000, height: 800, toJSON: () => ({}) }),
    });
    const viewer = { container } as unknown as OSDLikeViewer;

    expect(hasAccurateProjection(viewer)).toBe(false);
    expect(imageToElement(viewer, { x: 250, y: 300 }, IMAGE)).toEqual({ x: 250, y: 300 });
    expect(elementToImage(viewer, { x: 250, y: 300 }, IMAGE)).toEqual({ x: 250, y: 300 });
  });

  it('accepts a host-supplied point factory instead of recovering one', () => {
    const viewer = createViewer({ rotation: 90 });
    const options = { pointFactory: (x: number, y: number) => new OpenSeadragon.Point(x, y) };

    expect(hasAccurateProjection(viewer, options)).toBe(true);
    expect(imageToElement(viewer, { x: 137, y: 613 }, IMAGE, options)).toEqual(
      imageToElement(viewer, { x: 137, y: 613 }, IMAGE),
    );
  });
});
