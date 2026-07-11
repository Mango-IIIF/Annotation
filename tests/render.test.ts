import { describe, expect, it } from 'vitest';
import { elementToPoint, pointToElement } from '../src/render';

describe('OpenSeadragon coordinate adapter', () => {
  it('does not pass plain points into pointFromPixel', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 800,
      }),
    });

    const viewer = {
      container,
      viewport: {
        _containerInnerSize: { x: 1000, y: 800 },
        _margins: { left: 0, top: 0 },
        getBoundsNoRotate: () => ({ x: 0, y: 0, width: 1, height: 0.8 }),
        imageToViewportCoordinates: (x: number, y: number) => ({
          x: x / 1000,
          y: y / 1000,
        }),
        viewportToImageCoordinates: (x: number, y: number) => ({
          x: x * 1000,
          y: y * 1000,
        }),
        pointFromPixel: () => {
          throw new Error('pointFromPixel should not be called');
        },
      },
    };

    expect(elementToPoint(viewer, { x: 250, y: 300 }, { width: 1000, height: 800 })).toEqual({
      x: 250,
      y: 300,
    });
    expect(pointToElement(viewer, { x: 250, y: 300 }, { width: 1000, height: 800 })).toEqual({
      x: 250,
      y: 300,
    });
  });
});
