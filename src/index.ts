export { AnnotoriousEditor } from './annotorious-editor';
export type {
  AnnotationTool,
  AnnotoriousEditorEvents,
  AnnotoriousEditorOptions,
  LocalStoreChanges,
} from './annotorious-editor';
export { default as AnnotationCanvasEditor } from './AnnotationCanvasEditor.svelte';
export { default as AnnotationSidebar } from './sidebar/Sidebar.svelte';
export { default as AnnotationToolbar } from './toolbar/Toolbar.svelte';
export type { SamCommand, SamState, Tool } from './toolbar/types';
export type {
  Card as AnnotationSidebarCard,
  IdentifySnippetContext,
  SidebarSection,
  SidebarVisibility,
} from './sidebar/types';
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
  Annotation as SidebarAnnotation,
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
  POINT_BODY_PURPOSE,
  createPointImageAnnotation,
  isPointImageAnnotation,
  pointCenterOf,
  scaleTarget,
  toImageAnnotation,
  type ImageTarget,
} from './annotations/w3c';
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
export { getLocale, locale, setLocale, translate } from './core/i18n';
export type {
  ImageAnnotation,
  OpenSeadragonAnnotator,
} from '@annotorious/openseadragon';
export {
  AnnotationOverlay,
  projectOverlayItems,
  viewBoxProjector,
  type CanvasOverlayItem,
  type OverlayPoint,
  type OverlayProjector,
  type OverlayRect,
  type OverlayStyle,
  type OverlayViewBox,
  type ProjectedOverlayShape,
} from './view';
