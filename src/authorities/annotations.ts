import { bodiesOf } from '../annotations/model';
import { label } from '../annotations/iiif';
import type { Annotation, AnnotationBody } from '../annotations/types';
import type { AuthorityEntity } from './types';
import { WIKIDATA_URI } from './wikidata';

export const authorityBodies = (entities: AuthorityEntity[]): AnnotationBody[] =>
  entities.map((entity) => ({
    type: 'SpecificResource',
    source: entity.uri,
    purpose: 'identifying',
    label: { none: [entity.label] },
    ...(entity.generator ? { generator: { type: 'Software', name: entity.generator } as const } : {}),
  }));

/** Linked entities in a saved annotation. Any SpecificResource body with an identifying purpose counts. */
export const authoritiesOf = (annotation?: Annotation): AuthorityEntity[] => {
  if (!annotation) return [];
  return bodiesOf(annotation).flatMap((body) => {
    const uri = typeof body.source === 'string' ? body.source : body.source?.id || body.id || '';
    if (!uri || (body.type !== 'SpecificResource' && body.purpose !== 'identifying')) return [];
    const wikidataId = uri.match(WIKIDATA_URI)?.[1];
    return [
      {
        provider: wikidataId ? 'wikidata' : new URL(uri, 'http://x').hostname,
        id: wikidataId ?? uri.replace(/\/$/, '').split('/').pop() ?? uri,
        uri,
        label: label(body.label) || wikidataId || uri,
        ...(body.generator ? { generator: body.generator.name } : {}),
      },
    ];
  });
};
