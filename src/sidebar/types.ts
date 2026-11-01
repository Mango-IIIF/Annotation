import type { Annotation } from '../annotations/types';
import type { AuthorityEntity, AuthorityProvider } from '../authorities/types';

export interface Card {
  annotation: Annotation;
  title: string;
  text: string;
  eyebrow: string;
  /** Show (a shape) or jump (a time) is available. */
  locate?: 'show' | 'jump';
}

export type SidebarSection =
  | 'selection'
  | 'intents'
  | 'assist'
  | 'languages'
  | 'editor'
  | 'actions'
  | 'preview'
  | 'annotations';

export type SidebarVisibility = Partial<Record<SidebarSection, boolean>>;

/** Values passed to a consumer-supplied Identify snippet. */
export interface IdentifySnippetContext {
  /** Entities currently linked to the draft. */
  value: AuthorityEntity[];
  /** Replace the linked entities after a custom picker change. */
  onchange: (value: AuthorityEntity[]) => void;
  /** Providers passed to the sidebar, for custom UIs that still use them. */
  providers: AuthorityProvider[];
}
