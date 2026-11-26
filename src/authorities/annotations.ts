import { bodiesOf } from '../annotations/model';
import { label } from '../annotations/iiif';
import type { Annotation, AnnotationBody } from '../annotations/types';
import type { AuthorityEntity, NamedEntity } from './types';
import { WIKIDATA_URI } from './wikidata';

/** The entity's names by language when it has them (Wikidata), else its one name with no language (GeoNames). */
const entityLabel = (entity: NamedEntity): Record<string, string[]> => {
  const named = Object.entries(entity.labels ?? {}).filter(([, name]) => name.trim());
  return named.length
    ? Object.fromEntries(named.map(([language, name]) => [language, [name]]))
    : { none: [entity.label] };
};

/**
 * One SpecificResource per entity. Identify says `purpose: identifying`; the entity a tag stands
 * for needs no purpose (IIIF Cookbook recipe 0258).
 */
export const authorityBodies = (
  entities: AuthorityEntity[],
  purpose: 'identifying' | null = 'identifying',
): AnnotationBody[] =>
  entities.map((entity) => ({
    type: 'SpecificResource',
    source: entity.uri,
    ...(purpose ? { purpose } : {}),
    label: entityLabel(entity),
    ...(entity.generator ? { generator: { type: 'Software', name: entity.generator } as const } : {}),
  }));

/** The entity's names by language, from a label language map; none when it only has a language-neutral name. */
const namesOf = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const names = Object.entries(value as Record<string, unknown>)
    .filter(([language, values]) => language !== 'none' && Array.isArray(values) && typeof values[0] === 'string')
    .map(([language, values]) => [language, (values as string[])[0]] as const);
  return names.length ? Object.fromEntries(names) : undefined;
};

/**
 * Linked entities in a saved annotation: SpecificResource bodies that point at a URI, as Identify
 * writes them and as a tag's entity is written. Text bodies are not entities.
 */
export const authoritiesOf = (annotation?: Annotation, language = 'en'): NamedEntity[] => {
  if (!annotation) return [];
  return bodiesOf(annotation).flatMap((body) => {
    const uri = typeof body.source === 'string' ? body.source : body.source?.id || body.id || '';
    if (!uri || (body.type !== 'SpecificResource' && body.purpose !== 'identifying')) return [];
    const wikidataId = uri.match(WIKIDATA_URI)?.[1];
    const labels = namesOf(body.label);
    return [
      {
        provider: wikidataId ? 'wikidata' : new URL(uri, 'http://x').hostname,
        id: wikidataId ?? uri.replace(/\/$/, '').split('/').pop() ?? uri,
        uri,
        label: label(body.label, language) || wikidataId || uri,
        ...(labels ? { labels } : {}),
        // The saved names are the user's: don't replace them with the authority's.
        labelsChecked: true,
        ...(body.generator ? { generator: body.generator.name } : {}),
      },
    ];
  });
};
