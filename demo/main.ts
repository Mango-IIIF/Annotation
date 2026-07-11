import OpenSeadragon from 'openseadragon';
import { OSDAnnotationEditor, type CanonicalEditorMode, type ShapeData } from '../src';
import { shapeToW3C } from '../src/w3c';

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
  console.log(
    annotations.map((annotation) =>
      shapeToW3C(annotation, {
        source: 'demo-canvas',
        motivation: 'commenting',
      }),
    ),
  );
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
