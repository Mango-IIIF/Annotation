/*
 * Framework-free, Annotorious-free W3C / IIIF annotation data model,
 * intents, authorities, and time helpers.
 */

export {
  FIELDS_OF,
  INTENTS,
  MOTIVATION_OF,
  TEXT_INTENTS,
  bodiesOfDraft,
  bodyValue,
  draftFromAnnotation,
  draftProblem,
  emptyDraft,
  filledLanguages,
  hasContent,
  intentOf,
  labelOf,
  readAnnotation,
  splitTags,
  tagDrafts,
  type BodyContext,
  type Draft,
  type DraftProblem,
  type Intent,
  type LoadNote,
  type TextField,
  type Texts,
} from './annotations/intents';
export {
  annotationPageRefs,
  canvasScale,
  canvasesOf,
  idOf,
  label,
  mediaKindOf,
  mediaKindOfCanvas,
  metadataOf,
  type MediaKind,
} from './annotations/iiif';
export { normaliseAuthoringLanguages } from './annotations/languages';
export {
  annotationPage,
  annotationText,
  annotationTitle,
  bodiesOf,
  creatorIds,
  creatorName,
  languageChoice,
  languagesOf,
  mediaFragment,
  motivationsOf,
  newId,
  targetSource,
  textBody,
  timeTarget,
} from './annotations/model';
export {
  formatTime,
  parseTime,
  timeRange,
  validateTime,
  type TimeProblem,
  type TimeRange,
} from './annotations/time';
export type {
  Annotation,
  AnnotationBody,
  AnnotationPage,
  AnnotationTarget,
  Generator,
  LanguageMap,
  Motivation,
  ResourceTarget,
  Scope,
  Selector,
  SpecificResource,
} from './annotations/types';
export {
  authoritiesOf,
  authorityBodies,
} from './authorities/annotations';
export type {
  AuthorityEndpointConfig,
  AuthorityEntity,
  AuthorityProvider,
  NamedEntity,
} from './authorities/types';
export {
  WIKIDATA_URI,
  searchWikidata,
  wikidata,
  wikidataLabels,
} from './authorities/wikidata';
