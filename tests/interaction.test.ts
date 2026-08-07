import { describe, expect, it, vi } from 'vitest';
import { OSDAnnotationEditor } from '../src';
import type { AnnotationChange, ShapeData } from '../src';

const createContainer = () => {
  const container = document.createElement('div');
  document.body.append(container);
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      toJSON: () => ({}),
    }),
  });
  return container;
};

const rect = (id = 'r'): ShapeData => ({
  id,
  type: 'rect',
  geometry: { x: 100, y: 100, w: 200, h: 100 },
});

const createEditor = (options: Partial<Parameters<typeof OSDAnnotationEditor>[0]> = {}) => {
  const container = createContainer();
  const editor = new OSDAnnotationEditor({
    viewer: { container },
    canvasSize: { width: 1000, height: 800 },
    annotations: [rect()],
    selectedId: 'r',
    ...options,
  } as ConstructorParameters<typeof OSDAnnotationEditor>[0]);
  return { container, editor };
};

const key = (init: KeyboardEventInit & { key: string }) =>
  new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

describe('rotation', () => {
  it('is off until the host enables it', () => {
    const { container } = createEditor();
    expect(container.querySelector('[data-handle="rotate"]')).toBeNull();
  });

  it('renders a rotation handle when enabled', () => {
    const { container } = createEditor({ config: { rotation: { enabled: true } } });
    expect(container.querySelector('[data-handle="rotate"]')).toBeTruthy();
  });

  it('rotates programmatically and records one undo step', () => {
    const { editor } = createEditor({ config: { rotation: { enabled: true } } });

    expect(editor.rotate('r', 45)).toBe(true);
    const rotated = editor.getAnnotation('r');
    expect(rotated?.type).toBe('oriented-rect');
    if (rotated?.type !== 'oriented-rect') return;
    expect(rotated.geometry.angle).toBeCloseTo(45);

    editor.undo();
    expect(editor.getAnnotation('r')?.type).toBe('rect');
  });

  it('refuses to rotate a shape the host marked unrotatable', () => {
    const { editor } = createEditor({
      config: { rotation: { enabled: true } },
      policy: () => ({ rotatable: false }),
    });
    expect(editor.rotate('r', 45)).toBe(false);
    expect(editor.getAnnotation('r')?.type).toBe('rect');
  });

  it('offers no rotation handle for a point', () => {
    const { container } = createEditor({
      annotations: [{ id: 'p', type: 'point', geometry: { x: 10, y: 10 } }],
      selectedId: 'p',
      config: { rotation: { enabled: true } },
    });
    expect(container.querySelector('[data-handle="rotate"]')).toBeNull();
  });
});

describe('keyboard', () => {
  it('moves the selection with arrow keys', () => {
    const { editor } = createEditor();
    window.dispatchEvent(key({ key: 'ArrowRight' }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ x: 101 });
  });

  it('takes a coarser step with shift', () => {
    const { editor } = createEditor();
    window.dispatchEvent(key({ key: 'ArrowDown', shiftKey: true }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ y: 110 });
  });

  it('resizes with alt held', () => {
    const { editor } = createEditor();
    window.dispatchEvent(key({ key: 'ArrowRight', altKey: true }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ w: 201 });
  });

  it('rotates with the bracket keys when rotation is enabled', () => {
    const { editor } = createEditor({ config: { rotation: { enabled: true } } });
    window.dispatchEvent(key({ key: ']' }));

    const rotated = editor.getAnnotation('r');
    expect(rotated?.type).toBe('oriented-rect');
    if (rotated?.type !== 'oriented-rect') return;
    expect(rotated.geometry.angle).toBeCloseTo(15);
  });

  it('undoes and redoes from the keyboard', () => {
    const { editor } = createEditor();
    window.dispatchEvent(key({ key: 'ArrowRight' }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ x: 101 });

    window.dispatchEvent(key({ key: 'z', metaKey: true }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ x: 100 });

    window.dispatchEvent(key({ key: 'z', metaKey: true, shiftKey: true }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ x: 101 });
  });

  it('traverses shapes with Tab when nothing is selected', () => {
    const { editor } = createEditor({
      annotations: [rect('a'), rect('b')],
      selectedId: null,
    });

    window.dispatchEvent(key({ key: 'Tab' }));
    expect(editor.getSelectedId()).toBe('a');
    window.dispatchEvent(key({ key: 'Tab' }));
    expect(editor.getSelectedId()).toBe('b');
    window.dispatchEvent(key({ key: 'Tab', shiftKey: true }));
    expect(editor.getSelectedId()).toBe('a');
  });

  it('leaves a host text field alone', () => {
    const { editor } = createEditor();
    const input = document.createElement('input');
    document.body.append(input);

    input.dispatchEvent(key({ key: 'ArrowRight' }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ x: 100 });
    input.remove();
  });

  it('leaves a host region marked as opted out alone', () => {
    const { editor } = createEditor();
    const region = document.createElement('div');
    region.setAttribute('data-annotation-keys', 'off');
    const child = document.createElement('span');
    region.append(child);
    document.body.append(region);

    child.dispatchEvent(key({ key: 'ArrowRight' }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ x: 100 });
    region.remove();
  });

  it('does not move a shape the host marked read-only', () => {
    const { editor } = createEditor({ policy: () => ({ editable: false }) });
    window.dispatchEvent(key({ key: 'ArrowRight' }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ x: 100 });
  });
});

describe('accessibility', () => {
  it('groups the overlay rather than claiming to be an application', () => {
    const { container } = createEditor();
    const svg = container.querySelector('svg');
    // role="application" tells a screen reader to hand over all key handling,
    // which is only honest for a widget with a complete keyboard model.
    expect(svg?.getAttribute('role')).toBe('group');
  });

  it('marks the selected shape as pressed', () => {
    const { container } = createEditor();
    const shape = container.querySelector('[data-annotation-id="r"]');
    expect(shape?.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks a read-only shape as such and keeps it focusable', () => {
    const { container } = createEditor({ policy: () => ({ editable: false }) });
    const shape = container.querySelector('[data-annotation-id="r"]');
    expect(shape?.getAttribute('aria-readonly')).toBe('true');
    expect(shape?.getAttribute('tabindex')).toBe('0');
  });

  it('takes an unselectable shape out of the tab order', () => {
    const { container } = createEditor({ policy: () => ({ selectable: false }) });
    const shape = container.querySelector('[data-annotation-id="r"]');
    expect(shape?.getAttribute('tabindex')).toBe('-1');
  });

  it('uses a host-supplied accessible name', () => {
    const { container } = createEditor({ accessibleLabel: () => 'Detail of the left panel' });
    expect(
      container.querySelector('[data-annotation-id="r"]')?.getAttribute('aria-label'),
    ).toBe('Detail of the left panel');
  });
});

describe('renderer extension points', () => {
  it('lets a host cap the label size', () => {
    const { container } = createEditor({
      annotations: [{ ...rect(), label: 'A label' }],
      renderer: { label: () => ({ fontSize: 400, maxFontSize: 20 }) },
    });

    const label = container.querySelector('[data-role="label"]');
    expect(label?.getAttribute('font-size')).toBe('20');
  });

  it('lets a host suppress a label entirely', () => {
    const { container } = createEditor({
      annotations: [{ ...rect(), label: 'A label' }],
      renderer: { label: () => ({ visible: false }) },
    });
    expect(container.querySelector('[data-role="label"]')).toBeNull();
  });

  it('writes a label as text, never as markup', () => {
    const { container } = createEditor({
      annotations: [{ ...rect(), label: '<script>alert(1)</script>' }],
    });

    const label = container.querySelector('[data-role="label"]');
    expect(label?.textContent).toBe('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
  });

  it('accepts host classes and data attributes on a shape', () => {
    const { container } = createEditor({
      renderer: {
        shapeClassName: () => 'host-shape',
        shapeData: () => ({ hostId: '42' }),
      },
    });

    const shape = container.querySelector('[data-annotation-id="r"]');
    expect(shape?.getAttribute('class')).toBe('host-shape');
    expect(shape?.getAttribute('data-host-id')).toBe('42');
  });

  it('applies fill opacity only when the host sets it', () => {
    const { container } = createEditor();
    expect(container.querySelector('[data-annotation-id="r"]')?.hasAttribute('fill-opacity')).toBe(
      false,
    );

    const explicit = createEditor({ style: { fillOpacity: 0.5 } });
    expect(
      explicit.container.querySelector('[data-annotation-id="r"]')?.getAttribute('fill-opacity'),
    ).toBe('0.5');
  });
});

describe('lifecycle', () => {
  it('restores the container position it changed on mount', () => {
    const container = createContainer();
    expect(container.style.position).toBe('');

    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
    });
    expect(container.style.position).toBe('relative');

    editor.destroy();
    expect(container.style.position).toBe('');
  });

  it('leaves no overlay behind after repeated construct and destroy', () => {
    const container = createContainer();
    for (let round = 0; round < 5; round += 1) {
      const editor = new OSDAnnotationEditor({
        viewer: { container },
        canvasSize: { width: 1000, height: 800 },
      });
      editor.destroy();
    }
    expect(container.querySelectorAll('.mango-annotation-editor')).toHaveLength(0);
  });

  it('stops responding to keys once destroyed', () => {
    const { editor } = createEditor();
    editor.destroy();
    window.dispatchEvent(key({ key: 'ArrowRight' }));
    expect(editor.getAnnotation('r')?.geometry).toMatchObject({ x: 100 });
  });
});

describe('change events', () => {
  it('reports before and after geometry for a committed change', () => {
    const changes: AnnotationChange[] = [];
    const { editor } = createEditor({ onAnnotationChanged: (change) => changes.push(change) });

    editor.nudge('r', { x: 5, y: 0 });

    const committed = changes.filter((change) => !change.transient);
    expect(committed).toHaveLength(1);
    expect(committed[0]?.before?.geometry).toMatchObject({ x: 100 });
    expect(committed[0]?.after?.geometry).toMatchObject({ x: 105 });
    expect(committed[0]?.operation).toBe('move');
  });

  it('reports history state to a subscriber', () => {
    const onHistoryChanged = vi.fn();
    const { editor } = createEditor({ onHistoryChanged });
    editor.nudge('r', { x: 1, y: 0 });
    expect(onHistoryChanged).toHaveBeenCalledWith(expect.objectContaining({ canUndo: true }));
  });

  it('renders once for a batch rather than once per mutation', () => {
    const { container, editor } = createEditor({ annotations: [] });

    editor.batch(() => {
      for (let index = 0; index < 50; index += 1) {
        editor.addAnnotation({ ...rect(`b${index}`), id: `b${index}` });
      }
    });

    expect(container.querySelectorAll('[data-annotation-id]')).toHaveLength(50);
  });
});
