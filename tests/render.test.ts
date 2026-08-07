import { describe, expect, it } from 'vitest';
import { elementToPoint, pointToElement } from '../src/render';
import type { OSDLikeViewer } from '../src/types';

const CANVAS = { width: 1000, height: 800 };

const containerOf = (width: number, height: number) => {
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width, height, toJSON: () => ({}) }),
  });
  return container;
};

/**
 * Guards the boundary between this package and the viewport's own conversions.
 *
 * Rotation correctness is covered against a real viewport in
 * `coordinates.test.ts`. What is checked here is the contract those calls have
 * to honour: never hand the viewport a value it cannot use, and degrade
 * visibly rather than silently returning a wrong answer.
 */
describe('viewport conversion boundary', () => {
  it('never calls the viewport with a point it cannot operate on', () => {
    // A viewport that exposes the conversions but hands back plain objects,
    // so no usable point prototype can be borrowed. Calling through anyway
    // would throw inside OpenSeadragon on `point.rotate(...)`.
    const received: unknown[] = [];
    const viewer = {
      container: containerOf(1000, 800),
      viewport: {
        getCenter: () => ({ x: 0.5, y: 0.4 }),
        imageToViewerElementCoordinates: (pixel: unknown) => {
          received.push(pixel);
          throw new Error('the viewport was called with an unusable point');
        },
        viewerElementToImageCoordinates: (pixel: unknown) => {
          received.push(pixel);
          throw new Error('the viewport was called with an unusable point');
        },
      },
    } as unknown as OSDLikeViewer;

    expect(pointToElement(viewer, { x: 250, y: 300 }, CANVAS)).toEqual({ x: 250, y: 300 });
    expect(elementToPoint(viewer, { x: 250, y: 300 }, CANVAS)).toEqual({ x: 250, y: 300 });
    expect(received).toEqual([]);
  });

  it('uses the viewport when it can supply a usable point', () => {
    const calls: string[] = [];
    // A minimal stand-in for OpenSeadragon.Point: the prototype carries the
    // methods, which is exactly what the real one does.
    const prototype = {
      rotate() {
        return this;
      },
      minus() {
        return this;
      },
      plus() {
        return this;
      },
      times() {
        return this;
      },
    };
    const point = (x: number, y: number) => Object.assign(Object.create(prototype), { x, y });

    const viewer = {
      container: containerOf(1000, 800),
      viewport: {
        getCenter: () => point(0.5, 0.4),
        imageToViewerElementCoordinates: (pixel: { x: number; y: number }) => {
          calls.push('imageToViewerElement');
          return point(pixel.x * 2, pixel.y * 2);
        },
        viewerElementToImageCoordinates: (pixel: { x: number; y: number }) => {
          calls.push('viewerElementToImage');
          return point(pixel.x / 2, pixel.y / 2);
        },
      },
    } as unknown as OSDLikeViewer;

    expect(pointToElement(viewer, { x: 100, y: 200 }, CANVAS)).toEqual({ x: 200, y: 400 });
    expect(elementToPoint(viewer, { x: 200, y: 400 }, CANVAS)).toEqual({ x: 100, y: 200 });
    expect(calls).toEqual(['imageToViewerElement', 'viewerElementToImage']);
  });

  it('falls back proportionally when the viewport returns a non-finite point', () => {
    const prototype = { rotate() {}, minus() {}, plus() {}, times() {} };
    const point = (x: number, y: number) => Object.assign(Object.create(prototype), { x, y });

    const viewer = {
      container: containerOf(1000, 800),
      viewport: {
        getCenter: () => point(0.5, 0.4),
        imageToViewerElementCoordinates: () => point(Number.NaN, Number.NaN),
        viewerElementToImageCoordinates: () => point(Number.NaN, Number.NaN),
      },
    } as unknown as OSDLikeViewer;

    expect(pointToElement(viewer, { x: 250, y: 300 }, CANVAS)).toEqual({ x: 250, y: 300 });
    expect(elementToPoint(viewer, { x: 250, y: 300 }, CANVAS)).toEqual({ x: 250, y: 300 });
  });
});
