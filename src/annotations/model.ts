import type {
  Annotation,
  AnnotationBody,
  AnnotationPage,
  AnnotationTarget,
  Generator,
} from './types';
import { label } from './iiif';

export const newId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const bodiesOf = (annotation: Pick<Annotation, 'body'>): AnnotationBody[] =>
  annotation.body == null ? [] : Array.isArray(annotation.body) ? annotation.body : [annotation.body];

export const motivationsOf = (annotation: Pick<Annotation, 'motivation'>): string[] =>
  annotation.motivation == null
    ? []
    : Array.isArray(annotation.motivation)
      ? annotation.motivation
      : [annotation.motivation];

export const annotationText = (annotation: Annotation): string =>
  bodiesOf(annotation)
    .map((body) => body.value || label(body.label))
    .filter(Boolean)
    .join(' / ');

export const annotationTitle = (annotation: Annotation): string =>
  label(annotation.label) || annotationText(annotation);

/** The canvas (or manifest) an annotation is about, without its fragment. */
export const targetSource = (target: AnnotationTarget): string => {
  if (typeof target === 'string') return target.split('#')[0];
  if ('source' in target && target.source) {
    return typeof target.source === 'string' ? target.source : target.source.id;
  }
  return 'id' in target ? String(target.id).split('#')[0] : '';
};

export const textBody = (
  value: string,
  language: string,
  purpose?: string,
  generator?: Generator,
): AnnotationBody => ({
  type: 'TextualBody',
  value: value.trim(),
  format: 'text/plain',
  language,
  ...(purpose ? { purpose } : {}),
  ...(generator ? { generator } : {}),
});

export const mediaFragment = (start: number | string, end?: number | string | null): string =>
  `t=${Number(start) || 0}` + (end !== '' && end != null ? `,${Number(end)}` : '');

export const timeTarget = (
  canvasId: string,
  start: number | string,
  end?: number | string | null,
): AnnotationTarget => ({
  type: 'SpecificResource',
  source: canvasId,
  selector: {
    type: 'FragmentSelector',
    conformsTo: 'http://www.w3.org/TR/media-frags/',
    value: mediaFragment(start, end),
  },
});

export const annotationPage = (
  items: Annotation[],
  manifestId: string | null,
  pageId?: string,
): AnnotationPage => ({
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  ...(pageId ? { id: pageId } : {}),
  type: 'AnnotationPage',
  ...(manifestId ? { partOf: [{ id: manifestId, type: 'Manifest' }] } : {}),
  items,
});
