export { AnnotoriousEditor } from './annotorious-editor';
export type {
  AnnotationTool,
  AnnotoriousEditorEvents,
  AnnotoriousEditorOptions,
} from './annotorious-editor';
export { default as AnnotationSidebar } from './sidebar/Sidebar.svelte';
export { default as AnnotationToolbar } from './toolbar/Toolbar.svelte';
export type { SamCommand, SamState, Tool } from './toolbar/types';
export type {
  Card as AnnotationSidebarCard,
  IdentifySnippetContext,
  SidebarSection,
  SidebarVisibility,
} from './sidebar/types';
export { emptyDraft, type Draft, type Intent } from './annotations/intents';
export type { Annotation as SidebarAnnotation, Scope } from './annotations/types';
export type { AuthorityProvider, AuthorityEntity } from './authorities/types';
export { getLocale, locale, setLocale, translate } from './core/i18n';
export type {
  ImageAnnotation,
  OpenSeadragonAnnotator,
} from '@annotorious/openseadragon';
export {
  bakeRotation,
  basePoints,
  constrainDrawnRect,
  insertVertex,
  rectCorners,
  resizeHandlesFor,
  nearestSegment,
  pathLength,
  polygonArea,
  projectOntoSegment,
  removeVertex,
} from './geometry';
export { AnnotationStore, DuplicateAnnotationError } from './store';
export type {
  InteractionPolicyResolver,
  MutationOptions,
  ReplacementMode,
  SetAnnotationsOptions,
  StoreOptions,
} from './store';
export { CommandHistory, invertEntry } from './history';
export type {
  AnnotationChange,
  ChangeKind,
  ChangeOperation,
  HistoryEntry,
  HistoryPolicy,
  HistoryState,
} from './history';
export {
  angleOf,
  applyMatrix,
  boundsOfPoints,
  centroid,
  compose,
  constrainShape,
  IDENTITY,
  multiply,
  normalizeAngle,
  outlineContainsPoint,
  rotatePoint,
  rotateShape,
  rotationMatrix,
  scaleMatrix,
  scalePoint,
  scaleShape,
  shapeCenter,
  shapePivot,
  shapeRotation,
  signedAngle,
  snapAngle,
  snapAngleWithCardinals,
  toPolygonPoints,
  transformedBounds,
  transformShape,
  translateShape,
  translationMatrix,
} from './transform';
export type { Matrix } from './transform';
export type {
  AnnotationStyle,
  CanvasSize,
  FreehandAnnotation,
  LineAnnotation,
  Point,
  PointAnnotation,
  PolygonAnnotation,
  RectAnnotation,
  RectGeometry,
  ShapeData,
  ShapeGeometry,
  ShapeType,
} from './types';

export { formatTime, parseTime } from './annotations/time';
