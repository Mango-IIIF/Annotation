import type { AuthorityEntity, AuthorityProvider } from './types';

interface SearchResponse {
  search?: { id: string; label?: string; description?: string }[];
  error?: { info?: string };
}

export const WIKIDATA_URI = /^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/;

/** Read-only Wikibase entity search. No API key, no writes to Wikidata. */
export const searchWikidata = async (
  query: string,
  signal?: AbortSignal,
  language = 'en',
): Promise<AuthorityEntity[]> => {
  if (query.trim().length < 2) return [];

  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'wbsearchentities',
    search: query.trim(),
    language,
    uselang: language,
    type: 'item',
    limit: '6',
    format: 'json',
    origin: '*',
  }).toString();

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Wikidata search failed (${response.status}).`);
  const data = (await response.json()) as SearchResponse;
  if (data.error) throw new Error(data.error.info || 'Wikidata search failed.');

  return (data.search ?? [])
    .filter((entity) => /^Q\d+$/.test(entity.id))
    .map((entity) => ({
      provider: 'wikidata',
      id: entity.id,
      uri: `http://www.wikidata.org/entity/${entity.id}`,
      label: entity.label || entity.id,
      description: entity.description,
    }));
};

export const wikidata: AuthorityProvider = {
  id: 'wikidata',
  label: 'Wikidata',
  search: (query, signal) => searchWikidata(query, signal),
};
