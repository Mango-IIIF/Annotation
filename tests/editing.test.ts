import { describe, expect, it } from 'vitest';
import {
  constrainDrawnRect,
  orientedRectCorners,
  resizeOrientedRect,
  insertVertex,
  nearestSegment,
  pathLength,
  polygonArea,
  projectOntoSegment,
  removeVertex,
} from '../src/geometry';
import { OSDAnnotationEditor } from '../src';
import type { OSDAnnotationEditorOptions, ShapeData } from '../src';

const square: ShapeData = {
  id: 'p',
  type: 'polygon',
  geometry: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
};

const createEditor = (options: Partial<OSDAnnotationEditorOptions> = {}) => {
  const container = document.createElement('div');
  document.body.append(container);
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 800, toJSON: () => ({}) }),
  });
  return new OSDAnnotationEditor({
    viewer: { container },
    canvasSize: { width: 1000, height: 800 },
    ...options,
  } as OSDAnnotationEditorOptions);
};

describe('measurement', () => {
  it('measures polygon area regardless of winding direction', () => {
    expect(polygonArea(square.geometry.points as never)).toBeCloseTo(100);
    const reversed = [...(square.geometry.points as never as { x: number; y: number }[])].reverse();
    expect(polygonArea(reversed)).toBeCloseTo(100);
  });

  it('measures path length', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBeCloseTo(5);
    expect(pathLength([{ x: 0, y: 0 }])).toBe(0);
  });

  it('projects a point onto a segment and clamps to its ends', () => {
    const middle = projectOntoSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(middle.point).toEqual({ x: 5, y: 0 });
    expect(middle.t).toBeCloseTo(0.5);

    const beyond = projectOntoSegment({ x: 50, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    expect(beyond.point).toEqual({ x: 10, y: 0 });
    expect(beyond.t).toBe(1);
  });

  it('handles a degenerate segment without dividing by zero', () => {
    const result = projectOntoSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(result.distance).toBeCloseTo(5);
  });
});

describe('vertex editing', () => {
  it('finds the nearest segment, including the closing one', () => {
    // Nearest the left edge, which for a closed polygon is the segment from the
    // last point back to the first.
    const closing = nearestSegment(square.geometry.points as never, { x: -1, y: 5 }, true);
    expect(closing?.index).toBe(4);

    const open = nearestSegment(square.geometry.points as never, { x: -1, y: 5 }, false);
    // With the path open there is no closing segment to be nearest to.
    expect(open?.index).not.toBe(4);
  });

  it('inserts a vertex at the given index', () => {
    const next = insertVertex(square, 1, { x: 5, y: 0 });
    expect(next.geometry.points).toHaveLength(5);
    expect(next.geometry.points[1]).toEqual({ x: 5, y: 0 });
  });

  it('removes a vertex', () => {
    const five = insertVertex(square, 1, { x: 5, y: 0 });
    expect(removeVertex(five, 1).geometry.points).toHaveLength(4);
  });

  it('refuses to take a polygon below three points', () => {
    const triangle: ShapeData = {
      id: 't',
      type: 'polygon',
      geometry: { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }] },
    };
    expect(removeVertex(triangle, 0)).toBe(triangle);
  });

  it('refuses to take a path below two points', () => {
    const line: ShapeData = {
      id: 'f',
      type: 'freehand',
      geometry: { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
    };
    expect(removeVertex(line, 0)).toBe(line);
  });

  it('inserts through the editor at the nearest edge, as one undo step', () => {
    const editor = createEditor({ annotations: [square], selectedId: 'p' });

    expect(editor.insertVertex('p', { x: 5, y: -1 })).toBe(true);
    expect((editor.getAnnotation('p')?.geometry as { points: unknown[] }).points).toHaveLength(5);

    editor.undo();
    expect((editor.getAnnotation('p')?.geometry as { points: unknown[] }).points).toHaveLength(4);
  });

  it('refuses vertex edits on a read-only shape', () => {
    const editor = createEditor({
      annotations: [square],
      selectedId: 'p',
      policy: () => ({ editable: false }),
    });
    expect(editor.insertVertex('p', { x: 5, y: -1 })).toBe(false);
    expect(editor.removeVertex('p', 0)).toBe(false);
  });
});

describe('rectangle drawing constraints', () => {
  it('draws corner to corner by default', () => {
    expect(constrainDrawnRect({ x: 10, y: 10 }, { x: 30, y: 50 }, {})).toEqual({
      x: 10,
      y: 10,
      w: 20,
      h: 40,
    });
  });

  it('squares to the longer side', () => {
    expect(constrainDrawnRect({ x: 0, y: 0 }, { x: 30, y: 10 }, { square: true })).toEqual({
      x: 0,
      y: 0,
      w: 30,
      h: 30,
    });
  });

  it('draws from the centre', () => {
    expect(constrainDrawnRect({ x: 50, y: 50 }, { x: 60, y: 70 }, { fromCenter: true })).toEqual({
      x: 40,
      y: 30,
      w: 20,
      h: 40,
    });
  });

  it('normalizes a rectangle dragged up and to the left', () => {
    expect(constrainDrawnRect({ x: 50, y: 50 }, { x: 30, y: 20 }, {})).toEqual({
      x: 30,
      y: 20,
      w: 20,
      h: 30,
    });
  });
});

describe('draft control', () => {
  it('reports and cancels an in-progress draft', () => {
    const editor = createEditor({ mode: 'draw-polygon' });
    expect(editor.getDraft()).toEqual([]);
    expect(editor.commitDraft()).toBe(false);

    editor.cancelDrawing();
    expect(editor.getDraft()).toEqual([]);
  });
});

describe('capabilities', () => {
  it('advertises what this build supports', () => {
    expect(OSDAnnotationEditor.capabilities).toMatchObject({
      rotation: true,
      history: true,
      renderer: true,
      keyboard: true,
      orientedRect: true,
    });
  });
});

describe('resizing a rotated rectangle', () => {
  const rotated = (angle: number): ShapeData => ({
    id: 'o',
    type: 'oriented-rect',
    geometry: { center: { x: 100, y: 100 }, w: 80, h: 40, angle },
  });

  it('offers named edge handles rather than inert vertices', () => {
    const editor = createEditor({ annotations: [rotated(30)], selectedId: 'o' });
    const container = editor.getAnnotation('o') ? document.body : document.body;
    const handles = [...container.querySelectorAll('[data-handle]')]
      .map((element) => element.getAttribute('data-handle'))
      .filter((handle) => handle !== 'rotate');

    expect(handles).toEqual(expect.arrayContaining(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']));
  });

  it('resizes in the shape own frame, keeping the angle', () => {
    const next = resizeOrientedRect(
      rotated(0) as Extract<ShapeData, { type: 'oriented-rect' }>,
      'e',
      { x: 180, y: 100 },
      { width: 8, height: 8 },
      false,
    );
    expect(next.geometry.w).toBeCloseTo(120);
    expect(next.geometry.h).toBeCloseTo(40);
    expect(next.geometry.angle).toBe(0);
    // The west edge stayed put, so the centre moved half the growth.
    expect(next.geometry.center.x).toBeCloseTo(120);
  });

  it('keeps the opposite edge fixed when rotated', () => {
    const shape = rotated(90) as Extract<ShapeData, { type: 'oriented-rect' }>;
    // At 90 degrees the shape's local +x points down the screen.
    const next = resizeOrientedRect(shape, 'e', { x: 100, y: 180 }, { width: 8, height: 8 }, false);

    expect(next.geometry.angle).toBe(90);
    expect(next.geometry.w).toBeCloseTo(120);
    // The shape grew downward, so the centre moved down, not right.
    expect(next.geometry.center.x).toBeCloseTo(100);
    expect(next.geometry.center.y).toBeCloseTo(120);
  });

  it('never shrinks below the minimum size', () => {
    const next = resizeOrientedRect(
      rotated(45) as Extract<ShapeData, { type: 'oriented-rect' }>,
      'e',
      { x: -500, y: -500 },
      { width: 8, height: 8 },
      false,
    );
    expect(next.geometry.w).toBeGreaterThanOrEqual(8);
    expect(next.geometry.h).toBeGreaterThanOrEqual(8);
  });

  it('does not shear the shape', () => {
    const shape = rotated(37) as Extract<ShapeData, { type: 'oriented-rect' }>;
    const next = resizeOrientedRect(shape, 'se', { x: 200, y: 200 }, { width: 8, height: 8 }, false);

    const corners = orientedRectCorners(next.geometry);
    const side = (a: number, b: number) =>
      Math.hypot(corners[a]!.x - corners[b]!.x, corners[a]!.y - corners[b]!.y);

    // Opposite sides stay equal, which they would not if the resize had been
    // applied in screen space.
    expect(side(0, 1)).toBeCloseTo(side(3, 2), 6);
    expect(side(1, 2)).toBeCloseTo(side(0, 3), 6);
  });
});

describe('rotation affordance', () => {
  it('draws a stub of constant length, not a line from the centre', () => {
    const container = document.createElement('div');
    document.body.append(container);
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 800, toJSON: () => ({}) }),
    });

    const small: ShapeData = { id: 's', type: 'rect', geometry: { x: 10, y: 10, w: 20, h: 20 } };
    const large: ShapeData = { id: 's', type: 'rect', geometry: { x: 10, y: 10, w: 600, h: 400 } };

    const lengthFor = (shape: ShapeData) => {
      container.replaceChildren();
      new OSDAnnotationEditor({
        viewer: { container },
        canvasSize: { width: 1000, height: 800 },
        annotations: [shape],
        selectedId: 's',
        config: { rotation: { enabled: true } },
      } as OSDAnnotationEditorOptions);

      const stub = [...container.querySelectorAll('line')].at(-1);
      const x1 = Number(stub?.getAttribute('x1'));
      const y1 = Number(stub?.getAttribute('y1'));
      const x2 = Number(stub?.getAttribute('x2'));
      const y2 = Number(stub?.getAttribute('y2'));
      return Math.hypot(x2 - x1, y2 - y1);
    };

    // The stub is the same length whatever the shape's size.
    expect(lengthFor(small)).toBeCloseTo(lengthFor(large), 6);
    expect(lengthFor(small)).toBeCloseTo(28, 6);
  });
});
