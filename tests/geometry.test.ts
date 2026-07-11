import { describe, expect, it } from 'vitest';
import { normalizeRect, resizeRect, snapLinePoint, translateAnnotation } from '../src/geometry';

describe('geometry helpers', () => {
  it('normalizes negative rectangles', () => {
    expect(normalizeRect({ x: 20, y: 30, w: -10, h: -15 })).toEqual({
      x: 10,
      y: 15,
      w: 10,
      h: 15,
    });
  });

  it('translates rectangles inside the canvas', () => {
    expect(
      translateAnnotation(
        { id: 'a', type: 'rect', geometry: { x: 90, y: 90, w: 20, h: 20 } },
        { x: 20, y: 20 },
        { width: 100, height: 100 },
      ).geometry,
    ).toEqual({ x: 80, y: 80, w: 20, h: 20 });
  });

  it('resizes rectangle handles with minimum dimensions', () => {
    expect(
      resizeRect(
        { id: 'a', type: 'rect', geometry: { x: 10, y: 10, w: 50, h: 50 } },
        'e',
        { x: 12, y: 10 },
        { width: 100, height: 100 },
        { width: 8, height: 8 },
        false,
      ).geometry.w,
    ).toBe(8);
  });

  it('snaps lines to configured angle increments', () => {
    const snapped = snapLinePoint({ x: 0, y: 0 }, { x: 10, y: 1 }, 15);
    expect(snapped.y).toBeCloseTo(0);
  });
});
