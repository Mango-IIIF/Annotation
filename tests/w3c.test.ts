import { describe, expect, it } from 'vitest';
import { shapeToSelector, shapeToW3C, w3cToShape } from '../src/w3c';

describe('W3C adapters', () => {
  it('serializes rectangles as media fragments', () => {
    expect(
      shapeToSelector({
        id: 'a',
        type: 'rect',
        geometry: { x: 10.2, y: 20.5, w: 30.1, h: 40.7 },
      }),
    ).toEqual({
      type: 'FragmentSelector',
      conformsTo: 'http://www.w3.org/TR/media-frags/',
      value: 'xywh=pixel:10,21,30,41',
    });
  });

  it('round-trips a point annotation', () => {
    const w3c = shapeToW3C(
      { id: 'p', type: 'point', geometry: { x: 5, y: 7 }, text: 'Point' },
      { source: 'canvas' },
    );
    expect(w3cToShape(w3c)).toEqual({
      id: 'p',
      type: 'point',
      geometry: { x: 5, y: 7 },
      text: 'Point',
    });
  });

  it('parses svg selectors', () => {
    expect(
      w3cToShape({
        id: 'poly',
        type: 'Annotation',
        motivation: 'commenting',
        target: {
          type: 'SpecificResource',
          source: 'canvas',
          selector: {
            type: 'SvgSelector',
            value: '<svg><polygon points="0,0 10,0 10,10" /></svg>',
          },
        },
      }),
    ).toEqual({
      id: 'poly',
      type: 'polygon',
      geometry: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
      text: undefined,
    });
  });
});
