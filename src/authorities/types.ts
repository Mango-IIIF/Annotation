export interface AuthorityEntity {
  /** Which provider found it, e.g. `wikidata` or a configured endpoint's id. */
  provider: string;
  id: string;
  uri: string;
  label: string;
  description?: string;
  /** Set when the link was suggested by software, e.g. an AI model. */
  generator?: string;
}

/**
 * An entity with its name in each language, e.g. `{ en: 'Cardiff', cy: 'Caerdydd' }`: suggested by
 * the authority (Wikidata's labels) and set by the user. `label` stays the name shown in lists.
 */
export type NamedEntity = AuthorityEntity & {
  labels?: Record<string, string>;
  /** The names are settled (fetched, typed or loaded), so they aren't fetched again. */
  labelsChecked?: boolean;
};

export interface AuthorityProvider {
  id: string;
  label: string;
  placeholder?: string;
  search(query: string, signal?: AbortSignal): Promise<AuthorityEntity[]>;
}

/** A host-configured authority: `GET {endpoint}?q=` → `{ results: [{ id, uri, label, description? }] }`. */
export interface AuthorityEndpointConfig {
  id: string;
  label: string;
  endpoint: string;
  placeholder?: string;
}
