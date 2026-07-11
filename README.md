# @mango-iiif/annotation

Framework-agnostic OpenSeadragon annotation editor for high-resolution image overlays.

The package is intentionally canvas-centric. It does not parse IIIF manifests or own application annotation state. Host applications pass an OpenSeadragon viewer, canvas dimensions, annotations, and callbacks.

## Install

```sh
npm install @mango-iiif/annotation openseadragon
```

## Use

```ts
import { OSDAnnotationEditor, type ShapeData } from '@mango-iiif/annotation';

let annotations: ShapeData[] = [];

const editor = new OSDAnnotationEditor({
  viewer: osdViewer,
  canvasSize: { width: 5430, height: 7200 },
  annotations,
  mode: 'select',
  theme: {
    layers: {
      research: {
        strokeColor: '#facc15',
        fillColor: 'rgba(250, 204, 21, 0.12)',
      },
    },
  },
  onAnnotationCreated(annotation) {
    annotations = [...annotations, annotation];
    editor.setAnnotations(annotations);
  },
  onAnnotationUpdated(annotation) {
    annotations = annotations.map((item) =>
      item.id === annotation.id ? annotation : item,
    );
    editor.setAnnotations(annotations);
  },
  onAnnotationDeleted(id) {
    annotations = annotations.filter((item) => item.id !== id);
    editor.setAnnotations(annotations);
  },
});
```

## Modes

The canonical modes are:

- `none`
- `select`
- `draw-rect`
- `draw-polygon`
- `draw-point`
- `draw-line`
- `draw-freehand`

For Mango migration compatibility, the shorter tool names `rectangle`, `polygon`, `point`, `line`, and `freehand` are also accepted by `setMode`.

## Serialization

The core package uses simple `ShapeData` objects. W3C Web Annotations can be parsed and serialized with `@mango-iiif/w3c-parser`.

```ts
import { W3CParser } from '@mango-iiif/w3c-parser';

const annotation = W3CParser.serialize({
  id: shape.id,
  canvasId: 'https://example.org/canvas/1',
  text: shape.text ?? '',
  label: shape.label,
  layer: shape.layer,
  shape,
});

const parsedShape = W3CParser.parseAnnotation(annotation).shape;
```

## Development

```sh
npm run dev
npm run typecheck
npm test
npm run build
```
