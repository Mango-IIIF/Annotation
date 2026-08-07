import OpenSeadragon from 'openseadragon';
import {
  createAnnotation,
  createAnnotationPage,
  createTarget,
  createTextualBody,
  serializeAnnotationPage,
  stringLabel,
  type NeutralShape,
} from '@mango-iiif/w3c-parser';
import {
  OSDAnnotationEditor,
  toPolygonPoints,
  type CanonicalEditorMode,
  type ShapeData,
} from '../src';

const tileSource = {
  type: 'image',
  url: 'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2/full/1200,/0/default.jpg',
  buildPyramid: false,
};

const viewer = OpenSeadragon({
  id: 'viewer',
  prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
  tileSources: tileSource,
  showNavigator: true,
  gestureSettingsMouse: {
    clickToZoom: true,
  },
});

let annotations: ShapeData[] = [
  {
    id: 'sample-rect',
    type: 'rect',
    layer: 'highlights',
    label: 'Sample',
    text: 'Existing annotation',
    geometry: { x: 250, y: 180, w: 260, h: 180 },
  },
];
let selectedId: string | null = null;
const layerStyles: Record<string, { strokeColor: string; fillColor: string }> = {
  research: {
    strokeColor: '#facc15',
    fillColor: 'rgba(250, 204, 21, 0.14)',
  },
  transcription: {
    strokeColor: '#60a5fa',
    fillColor: 'rgba(96, 165, 250, 0.12)',
  },
  highlights: {
    strokeColor: '#34d399',
    fillColor: 'rgba(52, 211, 153, 0.16)',
  },
};

const editor = new OSDAnnotationEditor({
  config: {
    // Rotation is opt-in; the demo is where it should be visible.
    rotation: { enabled: true },
  },
  // A capped label renderer, the case that drove hosts to rewrite this SVG.
  renderer: {
    label: () => ({ minFontSize: 11, maxFontSize: 20, placement: 'below' }),
  },
  // Anything on the 'locked' layer is read-only, to show interaction policy.
  policy: (annotation) =>
    annotation.layer === 'locked' ? { editable: false, deletable: false } : undefined,
  onHistoryChanged: (state) => {
    const undo = document.querySelector<HTMLButtonElement>('#undo');
    const redo = document.querySelector<HTMLButtonElement>('#redo');
    if (undo) undo.disabled = !state.canUndo;
    if (redo) redo.disabled = !state.canRedo;
  },
  viewer,
  canvasSize: { width: 1200, height: 1594 },
  annotations,
  mode: 'select',
  currentLayer: 'research',
  theme: {
    layers: layerStyles,
  },
  onSelectionChanged(id) {
    selectedId = id;
    renderList();
  },
  onAnnotationCreated(annotation) {
    annotations = [...annotations, annotation];
    editor.setAnnotations(annotations);
    renderList();
  },
  onAnnotationUpdated(annotation) {
    annotations = annotations.map((item) => (item.id === annotation.id ? annotation : item));
    editor.setAnnotations(annotations);
    renderList();
  },
  onAnnotationDeleted(id) {
    annotations = annotations.filter((item) => item.id !== id);
    selectedId = null;
    editor.setAnnotations(annotations);
    renderList();
  },
});

const list = document.querySelector<HTMLUListElement>('#list');
const layerSelect = document.querySelector<HTMLSelectElement>('#layer');

document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as CanonicalEditorMode;
    editor.setMode(mode);
    document
      .querySelectorAll<HTMLButtonElement>('[data-mode]')
      .forEach((item) => item.classList.toggle('is-active', item === button));
  });
});

layerSelect?.addEventListener('change', () => {
  const layer = layerSelect?.value ?? 'research';
  editor.setCurrentLayer(layer);
  if (!selectedId) return;
  annotations = annotations.map((annotation) =>
    annotation.id === selectedId ? { ...annotation, layer } : annotation,
  );
  editor.setAnnotations(annotations);
  renderList();
});

document.querySelector<HTMLButtonElement>('#delete')?.addEventListener('click', () => {
  editor.delete();
});

document.querySelector<HTMLButtonElement>('#export')?.addEventListener('click', () => {
  // The editor emits neutral shapes. Turning them into Web Annotations is the
  // host's job, and it is demonstrated here rather than built into the package.
  const page = createAnnotationPage(
    annotations.map((annotation) =>
      createAnnotation({
        id: `https://example.org/annotation/${annotation.id}`,
        motivation: 'commenting',
        ...(annotation.text
          ? { bodies: [createTextualBody(annotation.text, { purpose: 'commenting' })] }
          : {}),
        ...(annotation.label ? { label: stringLabel(annotation.label) } : {}),
        targets: [
          createTarget('https://example.org/canvas/demo', toNeutralShape(annotation), {
            ...(annotation.layer ? { styleClass: annotation.layer } : {}),
          }),
        ],
      }),
    ),
    { id: 'https://example.org/annotation-page/demo' },
  );

  const { json, diagnostics } = serializeAnnotationPage(page, {
    profile: 'iiif-presentation-3',
  });
  console.log(JSON.stringify(json, null, 2));
  if (diagnostics.length > 0) console.warn(diagnostics);
});

function renderList() {
  if (!list) return;
  list.replaceChildren();
  for (const annotation of annotations) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${annotation.type} ${annotation.id.slice(0, 12)}`;
    button.className = annotation.id === selectedId ? 'is-selected' : '';
    button.addEventListener('click', () => {
      editor.select(annotation.id);
      if (layerSelect && annotation.layer) {
        layerSelect.value = annotation.layer;
        editor.setCurrentLayer(annotation.layer);
      }
    });
    item.append(button);
    list.append(item);
  }
}

renderList();

/**
 * Projects an editor shape onto the parser's neutral geometry.
 *
 * The two vocabularies are deliberately separate: the editor knows nothing
 * about selectors, and the parser knows nothing about pointers. A host bridges
 * them, and the bridge is this small.
 */
function toNeutralShape(annotation: ShapeData): NeutralShape {
  switch (annotation.type) {
    case 'rect':
      return { type: 'rect', geometry: annotation.geometry };
    case 'point':
      return { type: 'point', geometry: annotation.geometry };
    case 'line':
      return { type: 'line', geometry: annotation.geometry };
    case 'polygon':
      return { type: 'polygon', geometry: annotation.geometry };
    case 'freehand':
      return { type: 'freehand', geometry: annotation.geometry };
    case 'oriented-rect':
      // No IIIF selector represents an oriented rectangle, so it serializes as
      // a polygon of its rotated corners. `toPolygonPoints` exists precisely so
      // a host never has to work that out from the editor's SVG.
      return { type: 'polygon', geometry: { points: toPolygonPoints(annotation) } };
  }
}

document.querySelector<HTMLButtonElement>('#undo')?.addEventListener('click', () => {
  editor.undo();
});

document.querySelector<HTMLButtonElement>('#redo')?.addEventListener('click', () => {
  editor.redo();
});

document.querySelector<HTMLButtonElement>('#rotate')?.addEventListener('click', () => {
  const id = editor.getSelectedId();
  if (id) editor.rotate(id, 15);
});

document.querySelector<HTMLButtonElement>('#rotate-viewport')?.addEventListener('click', () => {
  const viewport = viewer.viewport;
  viewport.setRotation(viewport.getRotation() + 90, true);
});

document.querySelector<HTMLButtonElement>('#flip')?.addEventListener('click', () => {
  viewer.viewport.setFlip(!viewer.viewport.getFlip());
});

document.querySelector<HTMLButtonElement>('#stress')?.addEventListener('click', () => {
  // A thousand shapes in one batch: one render, one undo step.
  editor.batch(() => {
    for (let index = 0; index < 1000; index += 1) {
      editor.addAnnotation({
        id: `stress-${index}-${annotations.length}`,
        type: 'rect',
        geometry: {
          x: (index % 40) * 30,
          y: Math.floor(index / 40) * 30,
          w: 24,
          h: 24,
        },
      });
    }
  });
});
