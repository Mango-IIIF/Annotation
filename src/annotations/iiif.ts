/*
 * The slice of IIIF Presentation 2 and 3 the editor needs: labels, canvases,
 * media type and annotation page references. Mango's own parsing is not used,
 * so the editor stays independent of the viewer's internal model.
 */

export type MediaKind = 'image' | 'audio' | 'video';

type Json = Record<string, unknown>;

const asArray = <T>(value: T | T[] | undefined | null): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

export const idOf = (value: unknown): string => {
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value : '';
  const resource = value as Json;
  return String(resource.id ?? resource['@id'] ?? '');
};

/** A language map, string or array as display text, preferring `preferred`. */
export const label = (value: unknown, preferred = 'en'): string => {
  if (!value) return '';
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '');
  if (Array.isArray(value)) return value.map((entry) => label(entry, preferred)).join(' / ');
  if (typeof value !== 'object') return String(value);
  const map = value as Json;
  return label(
    map['@value'] ?? map[preferred] ?? map.en ?? map.none ?? Object.values(map)[0],
    preferred,
  );
};

export const canvasesOf = (manifest: unknown): Json[] => {
  const m = (manifest ?? {}) as Json;
  if (Array.isArray(m.items)) return m.items as Json[];
  const sequence = asArray(m.sequences as Json[] | undefined)[0];
  return asArray(sequence?.canvases as Json[] | undefined);
};

/** The painting bodies on a canvas, from v3 `items` or v2 `images`. */
const paintedBodies = (canvas: Json): Json[] => {
  const v3 = asArray(canvas.items as Json[] | undefined).flatMap((page) =>
    asArray(page.items as Json[] | undefined).flatMap((anno) => asArray(anno.body as Json)),
  );
  if (v3.length) {
    return (v3 as Json[]).flatMap((body) => (body.type === 'Choice' ? asArray(body.items as Json[]) : [body]));
  }
  return asArray(canvas.images as Json[] | undefined).map((image) => (image.resource ?? {}) as Json);
};

export const mediaKindOfCanvas = (canvas: Json | undefined): MediaKind | null => {
  if (!canvas) return null;
  for (const body of paintedBodies(canvas)) {
    const type = String(body.type ?? body['@type'] ?? '').toLowerCase();
    const format = String(body.format ?? '');
    if (type === 'sound' || type === 'audio' || format.startsWith('audio/')) return 'audio';
    if (type === 'video' || format.startsWith('video/')) return 'video';
    if (type === 'image' || type === 'dctypes:image' || format.startsWith('image/')) return 'image';
  }
  if (typeof canvas.duration === 'number') return 'video';
  return null;
};

/** The manifest's media kind, judged from its first canvas. */
export const mediaKindOf = (manifest: unknown): MediaKind =>
  mediaKindOfCanvas(canvasesOf(manifest)[0]) ?? 'image';

/** Scale from the painted image's pixels to canvas units, for export. */
export const canvasScale = (canvas: Json | undefined): { sx: number; sy: number } => {
  const image = canvas ? paintedBodies(canvas)[0] : undefined;
  const cw = Number(canvas?.width);
  const ch = Number(canvas?.height);
  const iw = Number(image?.width);
  const ih = Number(image?.height);
  return {
    sx: cw > 0 && iw > 0 ? cw / iw : 1,
    sy: ch > 0 && ih > 0 ? ch / ih : 1,
  };
};

/** AnnotationPage references (or embedded pages) on a manifest and its canvases. */
export const annotationPageRefs = (manifest: unknown): unknown[] => {
  const m = (manifest ?? {}) as Json;
  return [
    ...asArray(m.annotations as unknown[] | undefined),
    ...canvasesOf(manifest).flatMap((canvas) => asArray(canvas.annotations as unknown[] | undefined)),
    ...canvasesOf(manifest).flatMap((canvas) => asArray(canvas.otherContent as unknown[] | undefined)),
  ];
};

export const metadataOf = (manifest: unknown): { label: string; value: string }[] =>
  asArray((manifest as Json | undefined)?.metadata as Json[] | undefined).map((entry) => ({
    label: label(entry.label),
    value: label(entry.value),
  }));
