/*
 * "What would you like to do?" — the sidebar's six intents, and how each one
 * becomes W3C bodies. Each intent maps to exactly one motivation, so a saved
 * annotation can be read back into the form from its motivation alone. The
 * bodies follow the IIIF Cookbook:
 *
 *   note       commenting     optional label (IIIF language map) + the text (0266, 0306)
 *   transcribe supplementing  the text (0068)
 *   tag        tagging        one tag, as text, + optionally the entity it stands for (0021, 0258)
 *   identify   identifying    one SpecificResource per linked entity, purpose "identifying"
 *   highlight  highlighting   optional text ("why it matters")
 *   link       linking        optional text saying what the link is + a SpecificResource
 *                             pointing at another resource, optionally a time range of it (0022)
 *
 * "The text" is one TextualBody, or a Choice of one per language when there are
 * several, so viewers show one language (0346). Only Identify sets a purpose:
 * elsewhere the motivation already says what a body is.
 */

import type { AuthorityEntity } from '../authorities/types';
import { authoritiesOf, authorityBodies } from '../authorities/annotations';
import { bodiesOf, languageChoice, languagesOf, mediaFragment, motivationsOf, textBody } from './model';
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
  /** Which model suggested a value, keyed `field.language`. Editing it in the sidebar removes the entry. */
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

/** The text each intent keeps. A link's text says what the link is (IIIF Cookbook recipe 0022). */
export const FIELDS_OF: Record<Intent, TextField[]> = {
  note: ['label', 'note'],
  transcribe: ['transcription'],
  tag: ['tags'],
  identify: [],
  highlight: ['note'],
  link: ['note'],
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

/** Whether the draft holds anything typed or chosen, which switching intent would leave unsaved. */
export const hasContent = (draft: Draft, languages: readonly string[]): boolean =>
  filledLanguages(draft, languages).length > 0 || draft.entities.length > 0 || draft.linkUrl.trim() !== '';

const generatorOf = (draft: Draft, field: TextField, language: string) => {
  const name = draft.generators[`${field}.${language}`];
  return name ? ({ type: 'Software', name } as const) : undefined;
};

/** The field's text in each language that has some: one body, or a Choice of them. */
const text = (draft: Draft, field: TextField, languages: readonly string[]): AnnotationBody[] =>
  languageChoice(
    filled(draft.texts[field], languages).map((language) =>
      textBody(draft.texts[field][language], language, generatorOf(draft, field, language)),
    ),
  );

export const labelOf = (draft: Draft, languages: readonly string[]): LanguageMap | undefined => {
  if (draft.intent !== 'note') return undefined;
  const map: LanguageMap = {};
  for (const language of filled(draft.texts.label, languages)) {
    map[language] = [draft.texts.label[language].trim()];
  }
  return Object.keys(map).length ? map : undefined;
};

/**
 * One draft per tag: a tagging annotation is one tag (IIIF Cookbook recipe 0021). The keyword box
 * takes several, separated by commas; the nth keyword in each language is the same tag in that
 * language. The entity a tag stands for stays with the first tag.
 */
export const tagDrafts = (draft: Draft, languages: readonly string[]): Draft[] => {
  const tags = Object.fromEntries(languages.map((language) => [language, splitTags(draft.texts.tags[language] ?? '')]));
  const count = Math.max(0, ...Object.values(tags).map((list) => list.length));
  return Array.from({ length: count }, (_, i) => ({
    ...draft,
    texts: {
      ...draft.texts,
      tags: Object.fromEntries(languages.filter((language) => tags[language][i]).map((language) => [language, tags[language][i]])),
    },
    entities: i === 0 ? draft.entities.slice(0, 1) : [],
  }));
};

/** What the draft needs to know about the item, for writing links in full. */
export interface BodyContext {
  /** The manifest a canvas belongs to, when the URL is one of the item's canvases. */
  manifestOf?: (canvasId: string) => string | undefined;
}

/**
 * The link's target, as IIIF Cookbook recipe 0022 writes it: a canvas as `{ id, type, partOf }`,
 * another resource by its URL; a time range of it as a selector.
 */
const linkBody = (draft: Draft, context: BodyContext): AnnotationBody => {
  const url = draft.linkUrl.trim();
  const manifest = context.manifestOf?.(url);
  const timed = draft.linkStart.trim() !== '';
  const source = manifest
    ? { id: url, type: 'Canvas', partOf: [{ id: manifest, type: 'Manifest' }] }
    : timed
      ? { id: url }
      : url;
  return {
    type: 'SpecificResource',
    source,
    ...(timed
      ? {
          selector: {
            type: 'FragmentSelector',
            conformsTo: 'http://www.w3.org/TR/media-frags/',
            value: mediaFragment(draft.linkStart, draft.linkEnd),
          },
        }
      : {}),
  };
};

/** The bodies of one annotation. A tag draft with several keywords gives the first tag's; save one annotation per `tagDrafts()` entry. */
export const bodiesOfDraft = (draft: Draft, languages: readonly string[], context: BodyContext = {}): AnnotationBody[] => {
  switch (draft.intent) {
    case 'note':
      return text(draft, 'note', languages);
    case 'transcribe':
      return text(draft, 'transcription', languages);
    case 'highlight':
      return text(draft, 'note', languages);
    case 'tag': {
      const first = tagDrafts(draft, languages)[0];
      return first ? [...text(first, 'tags', languages), ...authorityBodies(first.entities, null)] : [];
    }
    case 'identify':
      return authorityBodies(draft.entities);
    case 'link':
      return draft.linkUrl.trim() ? [...text(draft, 'note', languages), linkBody(draft, context)] : [];
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
      return tagDrafts(draft, languages).length ? null : 'noTags';
    case 'identify':
      return draft.entities.length ? null : 'noEntity';
    case 'link':
      return isHttpUrl(draft.linkUrl.trim()) ? null : 'badUrl';
    default:
      return null;
  }
};

/**
 * Something in a loaded annotation that the form will change when it is saved:
 * - `motivations`: motivations other than the intent's are dropped
 * - `bodies`: bodies the intent doesn't use (e.g. an image, a styled text, a second link) are dropped
 * - `joined`: several texts in one language are joined into one
 * - `language`: text in a language the editor isn't configured for is moved into the first one
 */
export type LoadNote =
  | { kind: 'motivations'; values: string[] }
  | { kind: 'bodies'; count: number }
  | { kind: 'joined'; languages: string[] }
  | { kind: 'language'; from: string[]; to: string };

/** The form for a saved annotation, and what saving it from the form would change. */
export const readAnnotation = (
  annotation: Annotation,
  languages: readonly string[],
  displayLanguage = languages[0],
): { draft: Draft; notes: LoadNote[] } => {
  const draft = emptyDraft();
  const intent = intentOf(annotation) ?? 'note';
  draft.intent = intent;
  const notes: LoadNote[] = [];

  const motivations = motivationsOf(annotation).filter((m) => INTENT_OF[m] !== intent);
  if (motivations.length) notes.push({ kind: 'motivations', values: motivations });

  if (annotation.label && typeof annotation.label === 'object') {
    for (const [language, values] of Object.entries(annotation.label)) {
      if (Array.isArray(values)) draft.texts.label[language] = values.join(' ');
    }
  }

  const field: TextField | null = intent === 'identify' ? null : intent === 'transcribe' ? 'transcription' : intent === 'tag' ? 'tags' : 'note';
  const joined = new Set<string>();
  const unplaced = new Set<string>();
  let unused = 0;
  let resources = 0;
  // Tags are joined with commas and saved again as one annotation each, so nothing is lost.
  const joiner = field === 'tags' ? ', ' : '\n\n';

  for (const body of bodiesOf(annotation)) {
    if (body.type !== 'SpecificResource' && typeof body.value === 'string') {
      if (!field) {
        unused++;
        continue;
      }
      const given = languagesOf(body);
      const language = given.find((l) => languages.includes(l)) ?? languages[0];
      if (given.length && !given.some((l) => languages.includes(l))) given.forEach((l) => unplaced.add(l));
      const current = draft.texts[field][language];
      if (current && field !== 'tags') joined.add(language);
      draft.texts[field][language] = current ? current + joiner + body.value : body.value;
      if (body.generator) draft.generators[`${field}.${language}`] = body.generator.name;
      continue;
    }
    if (body.source && (intent === 'identify' || (intent === 'tag' && resources === 0))) {
      resources++;
      continue; // read below with authoritiesOf
    }
    if (body.source && intent === 'link' && resources === 0) {
      resources++;
      draft.linkUrl = typeof body.source === 'string' ? body.source : body.source.id;
      const range = timeRange(body);
      if (range) {
        draft.linkStart = String(range.start);
        draft.linkEnd = range.end == null ? '' : String(range.end);
      }
      continue;
    }
    unused++;
  }
  if (intent === 'identify') draft.entities = authoritiesOf(annotation, displayLanguage);
  if (intent === 'tag') draft.entities = authoritiesOf(annotation, displayLanguage).slice(0, 1);

  if (unused) notes.push({ kind: 'bodies', count: unused });
  if (joined.size) notes.push({ kind: 'joined', languages: [...joined] });
  if (unplaced.size) notes.push({ kind: 'language', from: [...unplaced], to: languages[0] });
  return { draft, notes };
};

/** Restores the form from a saved annotation. */
export const draftFromAnnotation = (annotation: Annotation, languages: readonly string[]): Draft =>
  readAnnotation(annotation, languages).draft;
