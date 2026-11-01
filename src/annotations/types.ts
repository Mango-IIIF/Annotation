/*
 * The W3C Web Annotation shapes the editor reads and writes.
 *
 * Deliberately loose: annotations arrive from manifests and hosts written by
 * other tools, so anything not listed here is carried through untouched.
 */

/** IIIF language map, e.g. `{ en: ['Prisoner'], cy: ['Carcharor'] }`. */
export type LanguageMap = Record<string, string[]>;

export type Motivation =
  | 'commenting'
  | 'supplementing'
  | 'tagging'
  | 'identifying'
  | 'highlighting'
  | 'linking'
  | (string & {});

export interface Generator {
  type: 'Software';
  name: string;
}

export interface Selector {
  type: string;
  value?: string;
  conformsTo?: string;
  [key: string]: unknown;
}

export interface AnnotationBody {
  type?: string;
  id?: string;
  value?: string;
  purpose?: string;
  format?: string;
  language?: string;
  label?: unknown;
  source?: string | { id: string; type?: string; format?: string };
  selector?: Selector;
  /** Set when the body was suggested by software, e.g. an AI model. */
  generator?: Generator;
  [key: string]: unknown;
}

export interface SpecificResource {
  type: 'SpecificResource';
  source: string | { id: string; type?: string; partOf?: unknown };
  selector?: Selector | Selector[];
  [key: string]: unknown;
}

export interface ResourceTarget {
  id: string;
  type: string;
  partOf?: unknown;
}

export type AnnotationTarget = string | SpecificResource | ResourceTarget;

export interface Annotation {
  '@context'?: string | string[];
  id: string;
  type: 'Annotation';
  motivation?: Motivation | Motivation[];
  label?: LanguageMap;
  created?: string;
  modified?: string;
  body?: AnnotationBody | AnnotationBody[];
  target: AnnotationTarget;
  [key: string]: unknown;
}

export interface AnnotationPage {
  '@context'?: string | string[];
  id?: string;
  type: 'AnnotationPage';
  partOf?: { id: string; type: string }[];
  items: Annotation[];
}

/** What an annotation is about. */
export type Scope = 'region' | 'canvas' | 'manifest' | 'time';
