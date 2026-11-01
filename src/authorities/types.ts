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
