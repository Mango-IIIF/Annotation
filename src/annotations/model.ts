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

/** The bodies, with a Choice's items read in its place (the same text in several languages, IIIF Cookbook recipe 0346). */
export const bodiesOf = (annotation: Pick<Annotation, 'body'>): AnnotationBody[] => {
  const bodies = annotation.body == null ? [] : Array.isArray(annotation.body) ? annotation.body : [annotation.body];
  return bodies.flatMap((body) => (body.type === 'Choice' && Array.isArray(body.items) ? body.items : [body]));
};

/** A body's languages: hosts may write `"cy"` or `["cy"]`. */
export const languagesOf = (body: AnnotationBody): string[] => {
  const value: unknown = body.language;
  if (Array.isArray(value)) return value.filter((language): language is string => typeof language === 'string');
  return typeof value === 'string' && value ? [value] : [];
};

/** The same text in each language: one body as it is, two or more as a Choice so viewers show one (recipe 0346). */
export const languageChoice = (bodies: AnnotationBody[]): AnnotationBody[] =>
  bodies.length > 1 ? [{ type: 'Choice', items: bodies }] : bodies;

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

/** No purpose: the annotation's motivation already says what the text is (IIIF Cookbook recipes 0021, 0266). */
export const textBody = (value: string, language: string, generator?: Generator): AnnotationBody => ({
  type: 'TextualBody',
  value: value.trim(),
  format: 'text/plain',
  language,
  ...(generator ? { generator } : {}),
});

/** The ids of an annotation's `creator`, which may be a URI, an Agent, or a list of either. */
export const creatorIds = (annotation: Annotation): string[] => {
  const creators = Array.isArray(annotation.creator) ? annotation.creator : [annotation.creator];
  return creators.flatMap((creator) => {
    if (typeof creator === 'string') return [creator];
    const id = (creator as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string' ? [id] : [];
  });
};

/** The first name an annotation's `creator` gives, if any. */
export const creatorName = (annotation: Annotation): string | undefined => {
  const creators = Array.isArray(annotation.creator) ? annotation.creator : [annotation.creator];
  for (const creator of creators) {
    const name = (creator as { name?: unknown } | null | undefined)?.name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return undefined;
};

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
