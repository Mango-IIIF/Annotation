import { describe, expect, it } from 'vitest';
import { OSDAnnotationEditor, type ShapeData } from '../src';

describe('OSDAnnotationEditor interactions', () => {
  it('draws a rectangle on the overlay and consumes drawing events', () => {
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

    let bubbledPointerDowns = 0;
    const created: ShapeData[] = [];
    container.addEventListener('pointerdown', () => {
      bubbledPointerDowns += 1;
    });

    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
      mode: 'draw-rect',
      onAnnotationCreated(annotation) {
        created.push(annotation);
      },
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    svg?.dispatchEvent(pointerEvent('pointerdown', 100, 120));
    svg?.dispatchEvent(pointerEvent('pointermove', 260, 300));
    svg?.dispatchEvent(pointerEvent('pointerup', 260, 300));

    expect(bubbledPointerDowns).toBe(0);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      type: 'rect',
      geometry: { x: 100, y: 120, w: 160, h: 180 },
    });

    editor.destroy();
    container.remove();
  });

  it('closes polygon drawing on double click and drops the duplicate point', () => {
    const container = createContainer();
    const created: ShapeData[] = [];
    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
      mode: 'draw-polygon',
      onAnnotationCreated(annotation) {
        created.push(annotation);
      },
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();

    click(svg, 100, 100);
    click(svg, 250, 100);
    click(svg, 250, 240);
    click(svg, 250, 240);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      type: 'polygon',
      geometry: {
        points: [
          { x: 100, y: 100 },
          { x: 250, y: 100 },
          { x: 250, y: 240 },
        ],
      },
    });

    editor.destroy();
    container.remove();
  });

  it('passes background pointer interaction through to the viewer in select mode', () => {
    const container = createContainer();
    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
      mode: 'select',
    });
    const svg = container.querySelector<SVGSVGElement>('svg');

    expect(svg?.style.pointerEvents).toBe('none');
    editor.setMode('draw-rect');
    expect(svg?.style.pointerEvents).toBe('auto');
    editor.setMode('select');
    expect(svg?.style.pointerEvents).toBe('none');

    editor.destroy();
    container.remove();
  });

  it('updates layer styles through the public API', () => {
    const container = createContainer();
    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
      annotations: [
        {
          id: 'layered',
          type: 'rect',
          layer: 'research',
          geometry: { x: 100, y: 100, w: 200, h: 120 },
        },
      ],
      theme: {
        layers: {
          research: { strokeColor: '#facc15', fillColor: 'rgba(250, 204, 21, 0.14)' },
        },
      },
    });

    expect(container.querySelector('[data-annotation-id="layered"]')?.getAttribute('stroke')).toBe(
      '#facc15',
    );

    editor.updateLayerStyle('research', {
      strokeColor: '#ef4444',
      fillColor: 'rgba(239, 68, 68, 0.16)',
    });

    expect(container.querySelector('[data-annotation-id="layered"]')?.getAttribute('stroke')).toBe(
      '#ef4444',
    );

    editor.destroy();
    container.remove();
  });

  it('changes annotation color when its layer changes', () => {
    const container = createContainer();
    const annotation: ShapeData = {
      id: 'layer-change',
      type: 'rect',
      layer: 'research',
      geometry: { x: 100, y: 100, w: 200, h: 120 },
    };
    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
      annotations: [annotation],
      theme: {
        layers: {
          research: { strokeColor: '#facc15', fillColor: 'rgba(250, 204, 21, 0.14)' },
          highlights: { strokeColor: '#34d399', fillColor: 'rgba(52, 211, 153, 0.16)' },
        },
      },
    });

    expect(
      container.querySelector('[data-annotation-id="layer-change"]')?.getAttribute('stroke'),
    ).toBe('#facc15');

    editor.setAnnotations([{ ...annotation, layer: 'highlights' }]);

    expect(
      container.querySelector('[data-annotation-id="layer-change"]')?.getAttribute('stroke'),
    ).toBe('#34d399');

    editor.destroy();
    container.remove();
  });

  it('renders edit handles only for selected annotations in select mode', () => {
    const container = createContainer();
    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
      selectedId: 'selected',
      annotations: [
        {
          id: 'selected',
          type: 'rect',
          geometry: { x: 100, y: 100, w: 200, h: 120 },
        },
      ],
    });

    expect(container.querySelectorAll('[data-handle]')).toHaveLength(8);
    editor.select(null);
    expect(container.querySelector('[data-handle]')).toBeNull();

    editor.destroy();
    container.remove();
  });

  it('uses the current layer style for draft drawing', () => {
    const container = createContainer();
    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
      mode: 'draw-rect',
      currentLayer: 'research',
      theme: {
        layers: {
          research: { strokeColor: '#facc15', fillColor: 'rgba(250, 204, 21, 0.14)' },
          highlights: { strokeColor: '#34d399', fillColor: 'rgba(52, 211, 153, 0.16)' },
        },
      },
    });
    const svg = container.querySelector('svg');

    svg?.dispatchEvent(pointerEvent('pointerdown', 100, 120));
    svg?.dispatchEvent(pointerEvent('pointermove', 260, 300));
    expect(container.querySelector('g:nth-of-type(2) rect')?.getAttribute('stroke')).toBe(
      '#facc15',
    );

    editor.setCurrentLayer('highlights');
    expect(container.querySelector('g:nth-of-type(2) rect')?.getAttribute('stroke')).toBe(
      '#34d399',
    );

    svg?.dispatchEvent(pointerEvent('pointerup', 260, 300));
    editor.destroy();
    container.remove();
  });

  it('keeps selected annotation stroke tied to its layer color', () => {
    const container = createContainer();
    const annotation: ShapeData = {
      id: 'selected-layer-change',
      type: 'rect',
      layer: 'research',
      geometry: { x: 100, y: 100, w: 200, h: 120 },
    };
    const editor = new OSDAnnotationEditor({
      viewer: { container },
      canvasSize: { width: 1000, height: 800 },
      selectedId: annotation.id,
      annotations: [annotation],
      theme: {
        layers: {
          research: { strokeColor: '#facc15', fillColor: 'rgba(250, 204, 21, 0.14)' },
          highlights: { strokeColor: '#34d399', fillColor: 'rgba(52, 211, 153, 0.16)' },
        },
      },
    });

    expect(
      container
        .querySelector('[data-annotation-id="selected-layer-change"]')
        ?.getAttribute('stroke'),
    ).toBe('#facc15');

    editor.setAnnotations([{ ...annotation, layer: 'highlights' }]);

    expect(
      container
        .querySelector('[data-annotation-id="selected-layer-change"]')
        ?.getAttribute('stroke'),
    ).toBe('#34d399');

    editor.destroy();
    container.remove();
  });
});

function createContainer() {
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
}

function click(target: SVGSVGElement | null, clientX: number, clientY: number, detail = 1) {
  target?.dispatchEvent(pointerEvent('pointerdown', clientX, clientY, detail));
  target?.dispatchEvent(pointerEvent('pointerup', clientX, clientY, detail));
}

function pointerEvent(type: string, clientX: number, clientY: number, detail = 1) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    detail,
  }) as PointerEvent;
}
