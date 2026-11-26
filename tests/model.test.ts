import { describe, expect, it } from 'vitest';
import { creatorIds, creatorName, type Annotation } from '../src';

const annotation = (creator?: unknown): Annotation => ({
  id: 'urn:uuid:1',
  type: 'Annotation',
  target: 'https://example.org/canvas/1',
  ...(creator === undefined ? {} : { creator }),
});

describe('creatorIds', () => {
  it('reads a creator given as a URI, an Agent, or a list of either', () => {
    expect(creatorIds(annotation('https://example.org/ann'))).toEqual(['https://example.org/ann']);
    expect(creatorIds(annotation({ id: 'https://example.org/ann', type: 'Person' }))).toEqual([
      'https://example.org/ann',
    ]);
    expect(
      creatorIds(annotation(['https://example.org/ann', { id: 'https://example.org/bob', type: 'Person' }])),
    ).toEqual(['https://example.org/ann', 'https://example.org/bob']);
  });

  it('has none for an annotation without one, or an Agent without an id', () => {
    expect(creatorIds(annotation())).toEqual([]);
    expect(creatorIds(annotation({ type: 'Person', name: 'Ann' }))).toEqual([]);
  });
});

describe('creatorName', () => {
  it('reads the first name a creator gives', () => {
    expect(creatorName(annotation({ id: 'https://example.org/ann', type: 'Person', name: ' Jane Jones ' }))).toBe(
      'Jane Jones',
    );
    expect(creatorName(annotation(['https://example.org/ann', { type: 'Person', name: 'Rhys Evans' }]))).toBe(
      'Rhys Evans',
    );
  });

  it('has none for a bare URI or no creator', () => {
    expect(creatorName(annotation('https://example.org/ann'))).toBeUndefined();
    expect(creatorName(annotation())).toBeUndefined();
  });
});
