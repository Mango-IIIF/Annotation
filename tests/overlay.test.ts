import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { AnnotationOverlay, projectOverlayItems, viewBoxProjector } from '../src/view';

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) {
    await unmount(component);
    component = undefined;
  }
  document.body.innerHTML = '';
});

describe('AnnotationOverlay', () => {
  it('projects rect, polygon, polyline, and point shapes via viewBoxProjector', () => {
    const project = viewBoxProjector({ x: 0, y: 0, w: 100, h: 100 }, 500, 500);
    const shapes = projectOverlayItems(
      [
        { id: 'r1', rect: { x: 10, y: 20, w: 30, h: 40 }, isHighlight: true, label: 'Box' },
        { id: 'p1', polygon: { points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }] } },
        { id: 'l1', polygon: { points: [{ x: 0, y: 10 }, { x: 20, y: 30 }] }, openPath: true },
        { id: 'pt1', point: { x: 25, y: 75 } },
      ],
      project,
    );

    expect(shapes.map((s) => s.kind)).toEqual(['rect', 'polygon', 'polyline', 'point']);
    expect(shapes[0].rect).toEqual({ x: 50, y: 100, width: 150, height: 200 });
    expect(shapes[3].point).toEqual({ x: 125, y: 375 });
  });

  it('renders accessible shapes, search hits, labels, and click/hover callbacks', () => {
    const onselect = vi.fn();
    const onhover = vi.fn();
    const project = viewBoxProjector({ x: 0, y: 0, w: 100, h: 100 }, 500, 500);
    const shapes = projectOverlayItems(
      [
        {
          id: 'hit-1',
          rect: { x: 10, y: 20, w: 30, h: 40 },
          isHighlight: true,
          label: 'Search hit',
          style: { strokeColor: '#facc15', fillColor: 'rgba(250, 204, 21, 0.18)' },
        },
      ],
      project,
    );

    component = mount(AnnotationOverlay, {
      target: document.body,
      props: { shapes, width: 500, height: 500, onselect, onhover },
    });
    flushSync();

    const rect = document.querySelector('rect')!;
    expect(rect.classList.contains('annotation-layer__shape--hit')).toBe(true);
    expect(rect.getAttribute('aria-label')).toBe('Search hit');
    expect(document.querySelector('text.annotation-layer__label')?.textContent?.trim()).toBe('Search hit');

    rect.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onselect).toHaveBeenCalledWith({ id: 'hit-1' });
  });
});
