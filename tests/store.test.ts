import { describe, expect, it, vi } from 'vitest';
import { AnnotationStore, DuplicateAnnotationError } from '../src/store';
import type { AnnotationChange } from '../src/history';
import type { ShapeData } from '../src/types';

const rect = (id: string, x = 0): ShapeData => ({
  id,
  type: 'rect',
  geometry: { x, y: 0, w: 10, h: 10 },
});

const moved = (shape: ShapeData, x: number): ShapeData =>
  ({ ...shape, geometry: { ...(shape.geometry as object), x } }) as ShapeData;

describe('mutations', () => {
  it('adds, reads, updates, and removes', () => {
    const store = new AnnotationStore();
    store.add(rect('a'));

    expect(store.size).toBe(1);
    expect(store.get('a')?.id).toBe('a');
    expect(store.has('a')).toBe(true);

    const previous = store.update(moved(rect('a'), 50));
    expect(previous?.geometry).toMatchObject({ x: 0 });
    expect(store.get('a')?.geometry).toMatchObject({ x: 50 });

    expect(store.remove('a')?.id).toBe('a');
    expect(store.size).toBe(0);
  });

  it('fails deterministically on a duplicate id', () => {
    const store = new AnnotationStore();
    store.add(rect('a'));
    expect(() => store.add(rect('a'))).toThrow(DuplicateAnnotationError);
    // The failed add left nothing behind.
    expect(store.size).toBe(1);
  });

  it('returns undefined rather than throwing for an unknown id', () => {
    const store = new AnnotationStore();
    expect(store.update(rect('missing'))).toBeUndefined();
    expect(store.remove('missing')).toBeUndefined();
    expect(store.get('missing')).toBeUndefined();
  });

  it('clears selection when the selected annotation is removed', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.select('a');
    expect(store.selectedId).toBe('a');
    store.remove('a');
    expect(store.selectedId).toBeNull();
  });
});

describe('interaction policy', () => {
  it('defaults to fully permitted', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    expect(store.canEdit('a')).toBe(true);
    expect(store.canSelect('a')).toBe(true);
    expect(store.canDelete('a')).toBe(true);
  });

  it('keeps a read-only shape selectable but not editable', () => {
    const store = new AnnotationStore({
      annotations: [rect('locked')],
      policy: () => ({ editable: false }),
    });

    expect(store.canSelect('locked')).toBe(true);
    expect(store.canEdit('locked')).toBe(false);
    // Rotation follows editability unless the host says otherwise.
    expect(store.canRotate('locked')).toBe(false);
    expect(store.select('locked')).toBe(true);
  });

  it('refuses to select an unselectable shape', () => {
    const store = new AnnotationStore({
      annotations: [rect('a')],
      policy: () => ({ selectable: false }),
    });
    expect(store.select('a')).toBe(false);
    expect(store.selectedId).toBeNull();
  });

  it('omits hidden shapes from the visible set but keeps them in the collection', () => {
    const store = new AnnotationStore({
      annotations: [rect('a'), rect('b')],
      policy: (annotation) => (annotation.id === 'b' ? { visible: false } : undefined),
    });

    expect(store.visible().map((item) => item.id)).toEqual(['a']);
    expect(store.all()).toHaveLength(2);
    expect(store.get('b')).toBeDefined();
  });
});

describe('history', () => {
  it('undoes and redoes a create', () => {
    const store = new AnnotationStore();
    store.add(rect('a'));

    expect(store.canUndo).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.size).toBe(0);

    expect(store.canRedo).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.get('a')).toBeDefined();
  });

  it('undoes a delete, restoring the shape', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.remove('a');
    expect(store.size).toBe(0);

    store.undo();
    expect(store.get('a')?.geometry).toMatchObject({ x: 0 });
  });

  it('undoes an update to the previous geometry', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.update(moved(rect('a'), 99));
    store.undo();
    expect(store.get('a')?.geometry).toMatchObject({ x: 0 });
  });

  it('collapses a gesture of many previews into one entry', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });

    store.beginTransaction('move');
    for (let step = 1; step <= 100; step += 1) {
      store.update(moved(rect('a'), step), { operation: 'move', transient: true });
    }
    store.update(moved(rect('a'), 100), { operation: 'move' });
    store.commitTransaction();

    expect(store.historyState().undoDepth).toBe(1);
    store.undo();
    expect(store.get('a')?.geometry).toMatchObject({ x: 0 });
  });

  it('never records a transient change on its own', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.update(moved(rect('a'), 5), { transient: true });
    expect(store.canUndo).toBe(false);
  });

  it('treats a create-then-edit inside one transaction as a single create', () => {
    const store = new AnnotationStore();
    store.batch('batch', () => {
      store.add(rect('a'));
      store.update(moved(rect('a'), 40));
    });

    expect(store.historyState().undoDepth).toBe(1);
    store.undo();
    expect(store.size).toBe(0);
  });

  it('discards the redo branch once a new action lands', () => {
    const store = new AnnotationStore();
    store.add(rect('a'));
    store.undo();
    expect(store.canRedo).toBe(true);

    store.add(rect('b'));
    expect(store.canRedo).toBe(false);
  });

  it('restores selection along with geometry', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.select('a');
    store.remove('a');
    expect(store.selectedId).toBeNull();

    store.undo();
    expect(store.get('a')).toBeDefined();
    expect(store.selectedId).toBe('a');
  });

  it('rolls back a failed batch without recording anything', () => {
    const store = new AnnotationStore();
    expect(() =>
      store.batch('batch', () => {
        store.add(rect('a'));
        throw new Error('host failure');
      }),
    ).toThrow('host failure');

    expect(store.canUndo).toBe(false);
  });

  it('reports state changes to a subscriber', () => {
    const onHistoryChanged = vi.fn();
    const store = new AnnotationStore({ onHistoryChanged });
    store.add(rect('a'));
    expect(onHistoryChanged).toHaveBeenCalledWith(
      expect.objectContaining({ canUndo: true, undoDepth: 1 }),
    );
  });

  it('respects the entry limit', () => {
    const store = new AnnotationStore({ historyLimit: 3 });
    for (let index = 0; index < 10; index += 1) store.add(rect(`a${index}`));
    expect(store.historyState().undoDepth).toBe(3);
  });
});

describe('setAll', () => {
  it('replaces by default and reports every change', () => {
    const changes: AnnotationChange[] = [];
    const store = new AnnotationStore({
      annotations: [rect('a'), rect('b')],
      onChange: (batch) => changes.push(...batch),
    });

    store.setAll([rect('b'), rect('c')]);

    expect(store.all().map((item) => item.id)).toEqual(['b', 'c']);
    expect(changes.filter((change) => change.kind === 'delete').map((c) => c.id)).toEqual(['a']);
    expect(changes.filter((change) => change.kind === 'create').map((c) => c.id)).toEqual(['c']);
  });

  it('merges without removing what was not mentioned', () => {
    const store = new AnnotationStore({ annotations: [rect('a'), rect('b')] });
    store.setAll([moved(rect('b'), 70), rect('c')], { mode: 'merge' });
    expect(store.all().map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
    expect(store.get('b')?.geometry).toMatchObject({ x: 70 });
  });

  it('resets history by default, so undo cannot reach a replaced document', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.update(moved(rect('a'), 30));
    expect(store.canUndo).toBe(true);

    store.setAll([rect('z')]);
    expect(store.canUndo).toBe(false);
  });

  it('preserves history when the caller asks for it', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.update(moved(rect('a'), 30));
    store.setAll([moved(rect('a'), 30)], { history: 'preserve' });
    expect(store.canUndo).toBe(true);
  });

  it('records the replacement as one undoable entry when asked', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.setAll([rect('b')], { history: 'record' });

    expect(store.historyState().undoDepth).toBe(1);
    store.undo();
    expect(store.all().map((item) => item.id)).toEqual(['a']);
  });

  it('drops a selection that the replacement removed', () => {
    const store = new AnnotationStore({ annotations: [rect('a')] });
    store.select('a');
    store.setAll([rect('b')]);
    expect(store.selectedId).toBeNull();
  });
});
