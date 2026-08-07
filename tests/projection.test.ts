import { describe, expect, it } from 'vitest';
import { OSDAnnotationEditor } from '../src';
import type { OSDAnnotationEditorOptions, ShapeData } from '../src';

/**
 * The overlay draws its shapes in image coordinates inside one transformed
 * group, so a pan or zoom is a single attribute write rather than a
 * reprojection of every point of every annotation.
 *
 * These assert the properties that architecture is supposed to buy, because
 * the cost only stays paid if something notices when it stops being true.
 */

const createHost = () => {
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

const rect = (id: string, x: number): ShapeData => ({
  id,
  type: 'rect',
  geometry: { x, y: 40, w: 60, h: 40 },
});

const createEditor = (options: Partial<OSDAnnotationEditorOptions> = {}) => {
  const container = createHost();
  const editor = new OSDAnnotationEditor({
    viewer: { container },
    canvasSize: { width: 1000, height: 800 },
    ...options,
  } as OSDAnnotationEditorOptions);
  return { container, editor };
};

describe('shapes are drawn in image coordinates', () => {
  it('writes geometry straight through, with no projection baked in', () => {
    const { container } = createEditor({ annotations: [rect('r', 120)] });
    const shape = container.querySelector('[data-annotation-id="r"]');

    // The stored geometry, verbatim. Whatever the viewport is doing lives in
    // the group's transform instead.
    expect(shape?.getAttribute('x')).toBe('120');
    expect(shape?.getAttribute('y')).toBe('40');
    expect(shape?.getAttribute('width')).toBe('60');
    expect(shape?.getAttribute('height')).toBe('40');
  });

  it('writes a polygon at its outline in image space', () => {
    const polygon: ShapeData = {
      id: 'p',
      type: 'polygon',
      geometry: { points: [{ x: 10, y: 20 }, { x: 40, y: 20 }, { x: 25, y: 60 }] },
    };
    const { container } = createEditor({ annotations: [polygon] });
    expect(container.querySelector('[data-annotation-id="p"]')?.getAttribute('points')).toBe(
      '10,20 40,20 25,60',
    );
  });

  it('carries the projection on the shape group', () => {
    const { container } = createEditor({ annotations: [rect('r', 10)] });
    const group = container.querySelector('[data-annotation-id="r"]')?.parentElement;
    expect(group?.getAttribute('transform')).toMatch(/^matrix\(/);
  });

  it('keeps labels and handles outside the transformed group', () => {
    const { container } = createEditor({
      annotations: [{ ...rect('r', 10), label: 'Note' }],
      selectedId: 'r',
    });

    const shapeGroup = container.querySelector('[data-annotation-id="r"]')?.parentElement;
    const label = container.querySelector('[data-role="label"]');
    const handle = container.querySelector('[data-handle]');

    // Both must keep a constant screen size, which the scaling group would
    // defeat.
    expect(label?.parentElement).not.toBe(shapeGroup);
    expect(handle?.parentElement).not.toBe(shapeGroup);
    expect(label?.parentElement?.getAttribute('transform')).toBeNull();
    expect(handle?.parentElement?.getAttribute('transform')).toBeNull();
  });

  it('counter-scales a point glyph so it does not grow with the zoom', () => {
    const { container } = createEditor({
      annotations: [{ id: 'pt', type: 'point', geometry: { x: 100, y: 100 } }],
    });

    const glyph = container.querySelector('[data-annotation-id="pt"]');
    expect(glyph?.getAttribute('cx')).toBe('100');
    // Marked for the projection pass to hold its screen radius steady.
    expect(glyph?.getAttribute('data-scale-invariant')).toBe('6');
  });
});

describe('a viewport change does not rebuild the shapes', () => {
  const viewportEditor = () => {
    const container = createHost();
    const handlers = new Map<string, Array<() => void>>();
    const viewer = {
      container,
      addHandler: (name: string, handler: () => void) => {
        handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      },
      removeHandler: () => {},
    };

    const editor = new OSDAnnotationEditor({
      viewer,
      canvasSize: { width: 1000, height: 800 },
      annotations: Array.from({ length: 25 }, (_unused, index) => rect(`r${index}`, index * 10)),
    } as unknown as OSDAnnotationEditorOptions);

    const fire = (name: string) => {
      for (const handler of handlers.get(name) ?? []) handler();
    };
    return { container, editor, fire };
  };

  it('keeps the very same shape elements across a viewport update', () => {
    const { container, fire } = viewportEditor();
    const before = [...container.querySelectorAll('[data-annotation-id]')];

    fire('animation');

    const after = [...container.querySelectorAll('[data-annotation-id]')];
    expect(after).toHaveLength(before.length);
    // Identity, not just count: the nodes were reprojected, not replaced.
    for (let index = 0; index < before.length; index += 1) {
      expect(after[index]).toBe(before[index]);
    }
  });

  it('does replace them when the annotations themselves change', () => {
    const { container, editor } = viewportEditor();
    const before = container.querySelector('[data-annotation-id="r0"]');

    editor.updateAnnotation({ ...rect('r0', 500) });

    expect(container.querySelector('[data-annotation-id="r0"]')).not.toBe(before);
  });
});

describe('drafts', () => {
  it('keeps draft handles after the projection pass', () => {
    const { container } = createEditor({ mode: 'draw-polygon' });
    const svg = container.querySelector('svg')!;

    const down = (x: number, y: number) =>
      svg.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
        } as PointerEventInit),
      );

    down(100, 100);
    down(200, 100);

    // The handle layer is rebuilt by the projection pass, which runs after the
    // shape pass; handles added during the latter used to be cleared.
    expect(container.querySelectorAll('[data-handle="draft"]')).toHaveLength(2);
  });
});
