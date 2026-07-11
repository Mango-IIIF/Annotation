import { describe, expect, it } from 'vitest';
import { W3CParser } from '@mango-iiif/w3c-parser';
import type { ShapeData } from '../src';

describe('W3C parser integration', () => {
  it('serializes editor shapes as Web Annotations', () => {
    const shape: ShapeData = {
      id: 'a',
      type: 'rect',
      geometry: { x: 10.2, y: 20.5, w: 30.1, h: 40.7 },
      text: 'Rectangle',
    };

    const annotation = W3CParser.serialize({
      id: shape.id,
      canvasId: 'canvas',
      text: shape.text ?? '',
      shape,
    });

    expect(annotation.target).toEqual({
      type: 'SpecificResource',
      source: 'canvas',
      selector: {
        type: 'FragmentSelector',
        conformsTo: 'http://www.w3.org/TR/media-frags/',
        value: 'xywh=pixel:10.2,20.5,30.1,40.7',
      },
    });
  });

  it('round-trips an editor shape', () => {
    const shape: ShapeData = { id: 'p', type: 'point', geometry: { x: 5, y: 7 }, text: 'Point' };
    const annotation = W3CParser.serialize({
      id: shape.id,
      canvasId: 'canvas',
      text: shape.text ?? '',
      shape,
    });

    expect(W3CParser.parseAnnotation(annotation)).toEqual({
      id: 'p',
      canvasId: 'canvas',
      text: 'Point',
      shape: {
        type: 'point',
        geometry: { x: 5, y: 7 },
      },
    });
  });

  it('parses svg selectors', () => {
    expect(
      W3CParser.parseAnnotation({
        id: 'poly',
        type: 'Annotation',
        motivation: 'commenting',
        body: [],
        target: {
          type: 'SpecificResource',
          source: 'canvas',
          selector: {
            type: 'SvgSelector',
            value: '<svg><polygon points="0,0 10,0 10,10" /></svg>',
          },
        },
      }).shape,
    ).toEqual({
      type: 'polygon',
      geometry: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
    });
  });
});
