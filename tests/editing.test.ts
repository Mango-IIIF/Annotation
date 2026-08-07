import { describe, expect, it } from 'vitest';
import {
  constrainDrawnRect,
  resizeRect,
  rectCorners,
  insertVertex,
  nearestSegment,
  pathLength,
  polygonArea,
  projectOntoSegment,
  removeVertex,
} from '../src/geometry';
import { OSDAnnotationEditor, outlineContainsPoint, toPolygonPoints } from '../src';
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
    type: 'rect',
    geometry: { x: 60, y: 80, w: 80, h: 40 },
    rotation: angle,
  });

  const resize = (shape: ShapeData, handle: string, point: { x: number; y: number }) =>
    resizeRect(
      shape as Extract<ShapeData, { type: 'rect' }>,
      handle,
      point,
      { width: 1000, height: 800 },
      { width: 8, height: 8 },
      false,
    );

  it('offers named edge handles at any angle', () => {
    const editor = createEditor({ annotations: [rotated(30)], selectedId: 'o' });
    expect(editor.getAnnotation('o')?.rotation).toBe(30);

    const handles = [...document.body.querySelectorAll('[data-handle]')]
      .map((element) => element.getAttribute('data-handle'))
      .filter((handle) => handle !== 'rotate');
    expect(handles).toEqual(expect.arrayContaining(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']));
  });

  it('resizes an upright rectangle from its handle', () => {
    const next = resize(rotated(0), 'e', { x: 180, y: 100 });
    expect(next.geometry.w).toBeCloseTo(120);
    expect(next.geometry.h).toBeCloseTo(40);
    expect(next.rotation).toBe(0);
  });

  it('keeps the opposite edge fixed when rotated', () => {
    // At 90 degrees the rectangle's local +x points down the screen.
    const shape = rotated(90);
    const next = resize(shape, 'e', { x: 100, y: 180 });

    expect(next.rotation).toBe(90);
    expect(next.geometry.w).toBeCloseTo(120);

    // The west edge, as drawn, has not moved.
    const before = toPolygonPoints(shape);
    const after = toPolygonPoints(next);
    expect(after[0]!.x).toBeCloseTo(before[0]!.x, 6);
    expect(after[0]!.y).toBeCloseTo(before[0]!.y, 6);
  });

  it('never shrinks below the minimum size', () => {
    const next = resize(rotated(45), 'e', { x: -500, y: -500 });
    expect(next.geometry.w).toBeGreaterThanOrEqual(8);
    expect(next.geometry.h).toBeGreaterThanOrEqual(8);
  });

  it('does not shear the shape', () => {
    const next = resize(rotated(37), 'se', { x: 200, y: 200 });
    const corners = toPolygonPoints(next);
    const side = (a: number, b: number) =>
      Math.hypot(corners[a]!.x - corners[b]!.x, corners[a]!.y - corners[b]!.y);

    // Opposite sides stay equal, which they would not if the resize had been
    // applied in screen space.
    expect(side(0, 1)).toBeCloseTo(side(3, 2), 6);
    expect(side(1, 2)).toBeCloseTo(side(0, 3), 6);
  });

  it('reports unrotated corners for an unrotated rectangle', () => {
    expect(rectCorners({ x: 0, y: 0, w: 10, h: 4 })[2]).toEqual({ x: 10, y: 4 });
  });
});

describe('rotation stub across shape types', () => {
  const container = () => {
    const element = document.createElement('div');
    document.body.append(element);
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => ({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 800, toJSON: () => ({}) }),
    });
    return element;
  };

  const stubFor = (shape: ShapeData) => {
    const host = container();
    new OSDAnnotationEditor({
      viewer: { container: host },
      canvasSize: { width: 1000, height: 800 },
      annotations: [shape],
      selectedId: shape.id,
      config: { rotation: { enabled: true } },
    } as OSDAnnotationEditorOptions);

    const line = [...host.querySelectorAll('line')].at(-1);
    const circle = [...host.querySelectorAll('circle')].at(-1);
    return {
      base: { x: Number(line?.getAttribute('x1')), y: Number(line?.getAttribute('y1')) },
      handle: { x: Number(circle?.getAttribute('cx')), y: Number(circle?.getAttribute('cy')) },
    };
  };

  it('anchors to the silhouette of a downward-pointing triangle, not its bounding box', () => {
    // Apex at the bottom, flat edge on top. The old code anchored to the top of
    // the bounding box regardless, which for a spikier shape sits in open space.
    const triangle: ShapeData = {
      id: 'tri',
      type: 'polygon',
      geometry: { points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }] },
    };

    const { base, handle } = stubFor(triangle);
    // The flat top edge is at y=100, and the stub rises from the centre line.
    expect(base.y).toBeCloseTo(100, 3);
    expect(base.x).toBeCloseTo(200, 3);
    // The handle sits a fixed distance beyond it, straight up.
    expect(handle.y).toBeCloseTo(base.y - 28, 3);
    expect(handle.x).toBeCloseTo(base.x, 3);
  });

  it('touches the silhouette of an upward-pointing triangle', () => {
    const triangle: ShapeData = {
      id: 'tri2',
      type: 'polygon',
      geometry: { points: [{ x: 200, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }] },
    };

    const { base } = stubFor(triangle);
    // The apex is the highest point, so the stub starts level with it.
    expect(base.y).toBeCloseTo(100, 3);
  });

  it('turns with a rotated polygon, and stays where the user left it', () => {
    const turned = stubFor({
      id: 'poly-turned',
      type: 'polygon',
      geometry: { points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }] },
      rotation: 90,
    });
    // Rotated a quarter turn clockwise, the stub points right rather than up.
    expect(turned.handle.x).toBeGreaterThan(turned.base.x);
    expect(Math.abs(turned.handle.y - turned.base.y)).toBeLessThan(1);
  });

  it('rests at screen up for an unrotated polygon', () => {
    const skewed: ShapeData = {
      id: 'skew',
      type: 'polygon',
      geometry: {
        points: [{ x: 100, y: 200 }, { x: 400, y: 100 }, { x: 350, y: 300 }, { x: 120, y: 320 }],
      },
    };

    const { base, handle } = stubFor(skewed);
    // Straight up from the base, whatever the polygon's shape.
    expect(handle.x).toBeCloseTo(base.x, 6);
    expect(handle.y).toBeCloseTo(base.y - 28, 6);
  });

  it('turns with a rotated rectangle', () => {
    const upright = stubFor({
      id: 'o1',
      type: 'rect',
      geometry: { x: 150, y: 170, w: 100, h: 60 },
    });
    const turned = stubFor({
      id: 'o2',
      type: 'rect',
      geometry: { x: 150, y: 170, w: 100, h: 60 },
      rotation: 90,
    });

    // Upright: the stub points up. At 90 degrees clockwise: it points right.
    expect(upright.handle.y).toBeLessThan(upright.base.y);
    expect(turned.handle.x).toBeGreaterThan(turned.base.x);
    expect(Math.abs(turned.handle.y - turned.base.y)).toBeLessThan(1);
  });

  it('keeps the stub a constant length for every shape type', () => {
    const shapes: ShapeData[] = [
      { id: 'a', type: 'rect', geometry: { x: 10, y: 10, w: 400, h: 300 } },
      {
        id: 'b',
        type: 'polygon',
        geometry: { points: [{ x: 10, y: 10 }, { x: 300, y: 40 }, { x: 120, y: 260 }] },
      },
      {
        id: 'c',
        type: 'freehand',
        geometry: { points: [{ x: 10, y: 10 }, { x: 90, y: 120 }, { x: 260, y: 60 }] },
      },
      {
        id: 'd',
        type: 'rect',
        geometry: { x: 140, y: 160, w: 120, h: 80 },
        rotation: 37,
      },
    ];

    for (const shape of shapes) {
      const { base, handle } = stubFor(shape);
      const length = Math.hypot(handle.x - base.x, handle.y - base.y);
      expect(length, `stub length for ${shape.type}`).toBeCloseTo(28, 6);
    }
  });
});

describe('rotation persists on every shape type', () => {
  const shapes: ShapeData[] = [
    { id: 'rect', type: 'rect', geometry: { x: 100, y: 100, w: 120, h: 60 } },
    {
      id: 'poly',
      type: 'polygon',
      geometry: { points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 200, y: 300 }] },
    },
    {
      id: 'free',
      type: 'freehand',
      geometry: { points: [{ x: 100, y: 100 }, { x: 180, y: 220 }, { x: 300, y: 160 }] },
    },
    { id: 'line', type: 'line', geometry: { start: { x: 100, y: 100 }, end: { x: 300, y: 200 } } },
  ];

  for (const shape of shapes) {
    it(`remembers the angle of a ${shape.type} rather than snapping back`, () => {
      const editor = createEditor({
        annotations: [shape],
        selectedId: shape.id,
        config: { rotation: { enabled: true } },
      });

      expect(editor.rotate(shape.id, 40)).toBe(true);
      // The angle survives, which is what stops the handle returning to the top
      // the moment a gesture ends.
      expect(editor.getAnnotation(shape.id)?.rotation).toBeCloseTo(40);
      // And the type never changes underneath the host.
      expect(editor.getAnnotation(shape.id)?.type).toBe(shape.type);

      editor.rotate(shape.id, 20);
      expect(editor.getAnnotation(shape.id)?.rotation).toBeCloseTo(60);

      editor.undo();
      expect(editor.getAnnotation(shape.id)?.rotation).toBeCloseTo(40);
    });
  }

  it('leaves stored geometry untouched, so a host reading it sees no surprise', () => {
    const polygon = shapes[1]!;
    const editor = createEditor({ annotations: [polygon], selectedId: 'poly' });
    editor.rotate('poly', 90);

    expect(editor.getAnnotation('poly')?.geometry).toEqual(polygon.geometry);
    // The rotation shows in the outline, which is what rendering and
    // serialization both use.
    expect(toPolygonPoints(editor.getAnnotation('poly')!)).not.toEqual(
      (polygon.geometry as { points: unknown[] }).points,
    );
  });

  it('hit-tests a rotated polygon against its outline', () => {
    const editor = createEditor({
      annotations: [
        {
          id: 'bar',
          type: 'polygon',
          geometry: {
            points: [{ x: 100, y: 190 }, { x: 400, y: 190 }, { x: 400, y: 210 }, { x: 100, y: 210 }],
          },
          rotation: 90,
        },
      ],
    });

    const shape = editor.getAnnotation('bar')!;
    // Turned upright, the bar now covers its own centre column, not its row.
    expect(outlineContainsPoint(shape, { x: 250, y: 320 })).toBe(true);
    expect(outlineContainsPoint(shape, { x: 380, y: 200 })).toBe(false);
  });
});
