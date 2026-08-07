import { describe, expect, it } from 'vitest';
import {
  createAnnotation,
  createTarget,
  parseWebAnnotation,
  projectAnnotation,
  serializeWebAnnotation,
  type NeutralShape,
} from '@mango-iiif/w3c-parser';
import type { ShapeData } from '../src';

/**
 * Boundary test between the editor's shapes and the parser's neutral geometry.
 *
 * This package does not depend on the parser — it is a devDependency, and
 * nothing in `src/` imports it. What is verified here is that the two geometry
 * vocabularies still line up, so a host can bridge them without a lossy
 * translation in the middle. It is the contract, not either implementation.
 *
 * The parser has its own suite for selector behaviour; this file should not
 * grow to duplicate it.
 */

const toNeutral = (shape: ShapeData): NeutralShape => {
  switch (shape.type) {
    case 'rect':
      return { type: 'rect', geometry: shape.geometry };
    case 'point':
      return { type: 'point', geometry: shape.geometry };
    case 'line':
      return { type: 'line', geometry: shape.geometry };
    case 'polygon':
      return { type: 'polygon', geometry: shape.geometry };
    case 'freehand':
      return { type: 'freehand', geometry: shape.geometry };
  }
};

const roundTrip = (shape: ShapeData): NeutralShape | undefined => {
  const annotation = createAnnotation({
    id: `https://example.org/annotation/${shape.id}`,
    motivation: 'commenting',
    targets: [createTarget('https://example.org/canvas/1', toNeutral(shape))],
  });
  const { json } = serializeWebAnnotation(annotation, { profile: 'iiif-presentation-3' });
  return projectAnnotation(parseWebAnnotation(json).document).targets[0]?.shape;
};

describe('editor shapes and parser geometry', () => {
  const shapes: ShapeData[] = [
    { id: 'rect', type: 'rect', geometry: { x: 10.2, y: 20.5, w: 30.1, h: 40.7 } },
    { id: 'point', type: 'point', geometry: { x: 5, y: 7 } },
    { id: 'line', type: 'line', geometry: { start: { x: 1, y: 2 }, end: { x: 3, y: 4 } } },
    {
      id: 'polygon',
      type: 'polygon',
      geometry: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
    },
    {
      id: 'freehand',
      type: 'freehand',
      geometry: { points: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 5 }] },
    },
  ];

  for (const shape of shapes) {
    it(`round-trips a ${shape.type} without changing its geometry`, () => {
      expect(roundTrip(shape)).toEqual(toNeutral(shape));
    });
  }

  it('keeps a line a line rather than collapsing it to a polygon', () => {
    // The distinction is load-bearing: an open path drawn as a stroke must not
    // come back closed and filled.
    expect(roundTrip(shapes[2]!)?.type).toBe('line');
    expect(roundTrip(shapes[4]!)?.type).toBe('freehand');
  });

  it('carries a layer through as a style class, never as a motivation', () => {
    const annotation = createAnnotation({
      id: 'https://example.org/annotation/layered',
      motivation: 'commenting',
      targets: [
        createTarget(
          'https://example.org/canvas/1',
          { type: 'rect', geometry: { x: 0, y: 0, w: 4, h: 4 } },
          { styleClass: 'mine' },
        ),
      ],
    });

    const { json } = serializeWebAnnotation(annotation, { profile: 'iiif-presentation-3' });
    expect(json.motivation).toBe('commenting');
    expect((json.target as Record<string, unknown>).styleClass).toBe('mine');
  });

  it('reads a path selector, which annotation clients commonly emit', () => {
    const shape = projectAnnotation(
      parseWebAnnotation({
        id: 'https://example.org/annotation/path',
        type: 'Annotation',
        motivation: 'commenting',
        body: [],
        target: {
          type: 'SpecificResource',
          source: 'https://example.org/canvas/1',
          selector: {
            type: 'SvgSelector',
            value: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0 L10 10 Z"/></svg>',
          },
        },
      }).document,
    ).targets[0]?.shape;

    expect(shape).toEqual({
      type: 'polygon',
      geometry: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
    });
  });
});
