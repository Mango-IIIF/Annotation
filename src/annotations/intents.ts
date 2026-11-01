/*
 * "What would you like to do?" — the sidebar's six intents, and how each one
 * becomes W3C bodies. Each intent maps to exactly one motivation, so a saved
 * annotation can be read back into the form from its motivation alone.
 *
 *   note       commenting     optional label (IIIF language map) + one TextualBody per language
 *   transcribe supplementing  one TextualBody per language
 *   tag        tagging        one TextualBody per keyword, purpose "tagging"
 *   identify   identifying    one SpecificResource per linked entity
 *   highlight  highlighting   optional TextualBody per language ("why it matters")
 *   link       linking        SpecificResource pointing at another resource, optionally a time range of it
 */

import type { AuthorityEntity } from '../authorities/types';
import { authoritiesOf, authorityBodies } from '../authorities/annotations';
import { bodiesOf, mediaFragment, motivationsOf, textBody } from './model';
import { timeRange } from './time';
import type { Annotation, AnnotationBody, LanguageMap, Motivation } from './types';

export const INTENTS = ['note', 'transcribe', 'tag', 'identify', 'highlight', 'link'] as const;
export type Intent = (typeof INTENTS)[number];

export const MOTIVATION_OF: Record<Intent, Motivation> = {
  note: 'commenting',
  transcribe: 'supplementing',
  tag: 'tagging',
  identify: 'identifying',
  highlight: 'highlighting',
  link: 'linking',
};

/** Also accepts motivations other tools use for the same thing. */
const INTENT_OF: Record<string, Intent> = {
  commenting: 'note',
  describing: 'note',
  supplementing: 'transcribe',
  transcribing: 'transcribe',
  tagging: 'tag',
  classifying: 'tag',
  identifying: 'identify',
  highlighting: 'highlight',
  bookmarking: 'highlight',
  linking: 'link',
};

export const intentOf = (annotation: Annotation): Intent | null => {
  for (const motivation of motivationsOf(annotation)) {
    const intent = INTENT_OF[motivation];
    if (intent) return intent;
  }
  return null;
};

/** Intents with free text, and so with the language switch. */
export const TEXT_INTENTS: readonly Intent[] = ['note', 'transcribe', 'tag', 'highlight'];

export type TextField = 'label' | 'note' | 'transcription' | 'tags';
export type Texts = Record<TextField, Record<string, string>>;

export interface Draft {
  intent: Intent | null;
  texts: Texts;
  /** Which model suggested a value, keyed `field.language`. Editing it removes the entry. */
  generators: Record<string, string>;
  entities: AuthorityEntity[];
  linkUrl: string;
  linkStart: string;
  linkEnd: string;
}

export const emptyDraft = (): Draft => ({
  intent: null,
  texts: { label: {}, note: {}, transcription: {}, tags: {} },
  generators: {},
  entities: [],
  linkUrl: '',
  linkStart: '',
  linkEnd: '',
});

/** The text inputs each intent shows. */
export const FIELDS_OF: Record<Intent, TextField[]> = {
  note: ['label', 'note'],
  transcribe: ['transcription'],
  tag: ['tags'],
  identify: [],
  highlight: ['note'],
  link: [],
};

export const splitTags = (value: string): string[] =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const filled = (values: Record<string, string>, languages: readonly string[]) =>
  languages.filter((language) => values[language]?.trim());

/** Languages with any text for the current intent, for the ✓ on the language tabs. */
export const filledLanguages = (draft: Draft, languages: readonly string[]): string[] => {
  const fields = draft.intent ? FIELDS_OF[draft.intent] : [];
  return languages.filter((language) =>
    fields.some((field) => draft.texts[field][language]?.trim()),
  );
};

const generatorOf = (draft: Draft, field: TextField, language: string) => {
  const name = draft.generators[`${field}.${language}`];
  return name ? ({ type: 'Software', name } as const) : undefined;
};

const textBodies = (
  draft: Draft,
  field: TextField,
  languages: readonly string[],
  purpose?: string,
): AnnotationBody[] =>
  filled(draft.texts[field], languages).map((language) =>
    textBody(draft.texts[field][language], language, purpose, generatorOf(draft, field, language)),
  );

export const labelOf = (draft: Draft, languages: readonly string[]): LanguageMap | undefined => {
  if (draft.intent !== 'note') return undefined;
  const map: LanguageMap = {};
  for (const language of filled(draft.texts.label, languages)) {
    map[language] = [draft.texts.label[language].trim()];
  }
  return Object.keys(map).length ? map : undefined;
};

const linkBody = (draft: Draft): AnnotationBody => {
  const url = draft.linkUrl.trim();
  if (draft.linkStart.trim() === '') return { type: 'SpecificResource', source: url, purpose: 'linking' };
  return {
    type: 'SpecificResource',
    source: { id: url },
    purpose: 'linking',
    selector: {
      type: 'FragmentSelector',
      conformsTo: 'http://www.w3.org/TR/media-frags/',
      value: mediaFragment(draft.linkStart, draft.linkEnd),
    },
  };
};

export const bodiesOfDraft = (draft: Draft, languages: readonly string[]): AnnotationBody[] => {
  switch (draft.intent) {
    case 'note':
      return textBodies(draft, 'note', languages);
    case 'transcribe':
      return textBodies(draft, 'transcription', languages);
    case 'highlight':
      return textBodies(draft, 'note', languages);
    case 'tag':
      return filled(draft.texts.tags, languages).flatMap((language) =>
        splitTags(draft.texts.tags[language]).map((tag) =>
          textBody(tag, language, 'tagging', generatorOf(draft, 'tags', language)),
        ),
      );
    case 'identify':
      return authorityBodies(draft.entities);
    case 'link':
      return draft.linkUrl.trim() ? [linkBody(draft)] : [];
    default:
      return [];
  }
};

/** A single body is written as an object, several as an array, none omitted. */
export const bodyValue = (bodies: AnnotationBody[]): AnnotationBody | AnnotationBody[] | undefined =>
  bodies.length === 0 ? undefined : bodies.length === 1 ? bodies[0] : bodies;

const isHttpUrl = (value: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export type DraftProblem = 'noIntent' | 'noText' | 'noTags' | 'noEntity' | 'badUrl' | null;

/** What is missing before the draft can be saved. */
export const draftProblem = (draft: Draft, languages: readonly string[]): DraftProblem => {
  switch (draft.intent) {
    case null:
      return 'noIntent';
    case 'note':
      return filled(draft.texts.note, languages).length ? null : 'noText';
    case 'transcribe':
      return filled(draft.texts.transcription, languages).length ? null : 'noText';
    case 'tag':
      return bodiesOfDraft(draft, languages).length ? null : 'noTags';
    case 'identify':
      return draft.entities.length ? null : 'noEntity';
    case 'link':
      return isHttpUrl(draft.linkUrl.trim()) ? null : 'badUrl';
    default:
      return null;
  }
};

const languageOf = (body: AnnotationBody, languages: readonly string[]) =>
  body.language && languages.includes(body.language) ? body.language : languages[0];

/** Restores the form from a saved annotation. */
export const draftFromAnnotation = (annotation: Annotation, languages: readonly string[]): Draft => {
  const draft = emptyDraft();
  draft.intent = intentOf(annotation) ?? 'note';

  if (annotation.label && typeof annotation.label === 'object') {
    for (const [language, values] of Object.entries(annotation.label)) {
      if (Array.isArray(values)) draft.texts.label[language] = values.join(' ');
    }
  }

  const field: TextField | null =
    draft.intent === 'transcribe'
      ? 'transcription'
      : draft.intent === 'tag'
        ? 'tags'
        : draft.intent === 'note' || draft.intent === 'highlight'
          ? 'note'
          : null;

  for (const body of bodiesOf(annotation)) {
    if (field && typeof body.value === 'string') {
      const language = languageOf(body, languages);
      const current = draft.texts[field][language];
      const joiner = field === 'tags' ? ', ' : '\n\n';
      draft.texts[field][language] = current ? current + joiner + body.value : body.value;
      if (body.generator) draft.generators[`${field}.${language}`] = body.generator.name;
    }
    if (draft.intent === 'link' && body.source) {
      draft.linkUrl = typeof body.source === 'string' ? body.source : body.source.id;
      const range = timeRange(body);
      if (range) {
        draft.linkStart = String(range.start);
        draft.linkEnd = range.end == null ? '' : String(range.end);
      }
    }
  }
  if (draft.intent === 'identify') draft.entities = authoritiesOf(annotation);
  return draft;
};
