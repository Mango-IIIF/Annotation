import { describe, expect, it } from 'vitest';
import {
  bodiesOfDraft,
  bodyValue,
  draftFromAnnotation,
  draftProblem,
  emptyDraft,
  filledLanguages,
  hasContent,
  labelOf,
  readAnnotation,
  tagDrafts,
  type Annotation,
  type Draft,
} from '../src';

const LANGS = ['en', 'cy'];

const draftWith = (patch: Partial<Draft> & { texts?: Partial<Draft['texts']> }): Draft => {
  const draft = emptyDraft();
  return { ...draft, ...patch, texts: { ...draft.texts, ...patch.texts } };
};

describe('intents → W3C bodies (the ui-test rules)', () => {
  it('note: a label language map, and the text in two languages as one Choice (cookbook 0346)', () => {
    const draft = draftWith({
      intent: 'note',
      texts: { label: { en: 'Station', cy: '' }, note: { en: ' A note ', cy: 'Nodyn' }, transcription: {}, tags: {} },
    });
    expect(labelOf(draft, LANGS)).toEqual({ en: ['Station'] });
    expect(bodiesOfDraft(draft, LANGS)).toEqual([
      {
        type: 'Choice',
        items: [
          { type: 'TextualBody', value: 'A note', format: 'text/plain', language: 'en' },
          { type: 'TextualBody', value: 'Nodyn', format: 'text/plain', language: 'cy' },
        ],
      },
    ]);
  });

  it('text in one language is a plain TextualBody', () => {
    const draft = draftWith({ intent: 'transcribe', texts: { transcription: { cy: 'Gorsaf' }, label: {}, note: {}, tags: {} } });
    expect(bodiesOfDraft(draft, LANGS)).toEqual([{ type: 'TextualBody', value: 'Gorsaf', format: 'text/plain', language: 'cy' }]);
  });

  it('writes one body as an object and several as an array', () => {
    const one = [{ type: 'TextualBody', value: 'a' }];
    expect(bodyValue(one)).toEqual(one[0]);
    expect(bodyValue([...one, ...one])).toHaveLength(2);
    expect(bodyValue([])).toBeUndefined();
  });

  it('tag: one annotation per keyword, the nth keyword in each language being the same tag (cookbook 0021)', () => {
    const draft = draftWith({ intent: 'tag', texts: { tags: { en: 'mill, , wool', cy: 'melin' }, label: {}, note: {}, transcription: {} } });
    const tags = tagDrafts(draft, LANGS);
    expect(tags.map((t) => t.texts.tags)).toEqual([{ en: 'mill', cy: 'melin' }, { en: 'wool' }]);
    expect(tags.map((t) => bodiesOfDraft(t, LANGS))).toEqual([
      [
        {
          type: 'Choice',
          items: [
            { type: 'TextualBody', value: 'mill', format: 'text/plain', language: 'en' },
            { type: 'TextualBody', value: 'melin', format: 'text/plain', language: 'cy' },
          ],
        },
      ],
      [{ type: 'TextualBody', value: 'wool', format: 'text/plain', language: 'en' }],
    ]);
    // Asked for the bodies of the whole draft, it gives the first tag's.
    expect(bodiesOfDraft(draft, LANGS)).toEqual(bodiesOfDraft(tags[0], LANGS));
  });

  it('tag: the entity it stands for, with no purpose, on the first tag only (cookbook 0258)', () => {
    const entity = { provider: 'wikidata', id: 'Q18624915', uri: 'http://www.wikidata.org/entity/Q18624915', label: 'Gänseliesel' };
    const draft = draftWith({ intent: 'tag', entities: [entity], texts: { tags: { en: 'fountain, square' }, label: {}, note: {}, transcription: {} } });
    const [first, second] = tagDrafts(draft, LANGS);
    expect(bodiesOfDraft(first, LANGS)).toEqual([
      { type: 'TextualBody', value: 'fountain', format: 'text/plain', language: 'en' },
      { type: 'SpecificResource', source: entity.uri, label: { none: ['Gänseliesel'] } },
    ]);
    expect(second.entities).toEqual([]);
  });

  it('identify: a SpecificResource per linked entity', () => {
    const draft = draftWith({
      intent: 'identify',
      entities: [{ provider: 'wikidata', id: 'Q84', uri: 'http://www.wikidata.org/entity/Q84', label: 'London' }],
    });
    expect(bodiesOfDraft(draft, LANGS)).toEqual([
      { type: 'SpecificResource', source: 'http://www.wikidata.org/entity/Q84', purpose: 'identifying', label: { none: ['London'] } },
    ]);
  });

  it('link: a time range on the linked resource when given, and no purpose (cookbook 0022)', () => {
    const draft = draftWith({ intent: 'link', linkUrl: 'https://example.org/rec', linkStart: '12', linkEnd: '30' });
    expect(bodiesOfDraft(draft, LANGS)).toEqual([
      {
        type: 'SpecificResource',
        source: { id: 'https://example.org/rec' },
        selector: { type: 'FragmentSelector', conformsTo: 'http://www.w3.org/TR/media-frags/', value: 't=12,30' },
      },
    ]);
  });

  it('link: to one of the item’s canvases, with text saying what it is (cookbook 0022)', () => {
    const canvas = 'https://example.org/iiif/1/canvas/p2';
    const draft = draftWith({ intent: 'link', linkUrl: canvas, texts: { note: { en: 'A close-up' }, label: {}, transcription: {}, tags: {} } });
    const manifestOf = (id: string) => (id === canvas ? 'https://example.org/iiif/1/manifest' : undefined);
    expect(bodiesOfDraft(draft, LANGS, { manifestOf })).toEqual([
      { type: 'TextualBody', value: 'A close-up', format: 'text/plain', language: 'en' },
      {
        type: 'SpecificResource',
        source: { id: canvas, type: 'Canvas', partOf: [{ id: 'https://example.org/iiif/1/manifest', type: 'Manifest' }] },
      },
    ]);
  });

  it('highlight needs no text', () => {
    expect(draftProblem(draftWith({ intent: 'highlight' }), LANGS)).toBeNull();
    expect(bodiesOfDraft(draftWith({ intent: 'highlight' }), LANGS)).toEqual([]);
  });

  it('reports what is missing before saving', () => {
    expect(draftProblem(emptyDraft(), LANGS)).toBe('noIntent');
    expect(draftProblem(draftWith({ intent: 'note' }), LANGS)).toBe('noText');
    expect(draftProblem(draftWith({ intent: 'identify' }), LANGS)).toBe('noEntity');
    expect(draftProblem(draftWith({ intent: 'link', linkUrl: 'javascript:alert(1)' }), LANGS)).toBe('badUrl');
  });

  it('keeps AI provenance as a generator until the value is retyped', () => {
    const draft = draftWith({
      intent: 'transcribe',
      texts: { transcription: { en: 'Aberystwyth' }, label: {}, note: {}, tags: {} },
      generators: { 'transcription.en': 'claude-opus-5-5' },
    });
    expect(bodiesOfDraft(draft, LANGS)[0].generator).toEqual({ type: 'Software', name: 'claude-opus-5-5' });
  });

  it('marks the other languages that have text', () => {
    const draft = draftWith({ intent: 'note', texts: { note: { cy: 'Nodyn' }, label: {}, transcription: {}, tags: {} } });
    expect(filledLanguages(draft, LANGS)).toEqual(['cy']);
  });

  it('knows when switching intent would leave something unsaved', () => {
    expect(hasContent(emptyDraft(), LANGS)).toBe(false);
    expect(hasContent(draftWith({ intent: 'note', texts: { note: { en: 'Hi' }, label: {}, transcription: {}, tags: {} } }), LANGS)).toBe(true);
    expect(hasContent(draftWith({ intent: 'link', linkUrl: 'https://example.org' }), LANGS)).toBe(true);
    // Text typed under another intent doesn't count: it isn't what this intent saves.
    expect(hasContent(draftWith({ intent: 'identify', texts: { note: { en: 'Hi' }, label: {}, transcription: {}, tags: {} } }), LANGS)).toBe(false);
  });
});

describe('reading a saved annotation back into the form', () => {
  it('round-trips a bilingual note', () => {
    const draft = draftWith({
      intent: 'note',
      texts: { label: { en: 'Title' }, note: { en: 'Hello', cy: 'Helo' }, transcription: {}, tags: {} },
    });
    const annotation: Annotation = {
      id: 'urn:uuid:1',
      type: 'Annotation',
      motivation: 'commenting',
      label: labelOf(draft, LANGS),
      body: bodiesOfDraft(draft, LANGS),
      target: 'https://example.org/canvas/1',
    };
    const restored = draftFromAnnotation(annotation, LANGS);
    expect(restored.intent).toBe('note');
    expect(restored.texts.label.en).toBe('Title');
    expect(restored.texts.note).toEqual({ en: 'Hello', cy: 'Helo' });
  });

  it('maps motivations written by other tools to an intent', () => {
    const annotation: Annotation = {
      id: 'x',
      type: 'Annotation',
      motivation: 'transcribing',
      body: { type: 'TextualBody', value: 'Text', language: 'cy' },
      target: 'c',
    };
    const restored = draftFromAnnotation(annotation, LANGS);
    expect(restored.intent).toBe('transcribe');
    expect(restored.texts.transcription.cy).toBe('Text');
  });

  it('reports what saving from the form would change', () => {
    const annotation: Annotation = {
      id: 'x',
      type: 'Annotation',
      motivation: ['commenting', 'describing', 'classifying'],
      body: [
        { type: 'TextualBody', value: 'One', language: 'en' },
        { type: 'TextualBody', value: 'Two', language: 'en' },
        { type: 'TextualBody', value: 'Gallia est omnis divisa', language: 'la' },
        { type: 'Image', id: 'https://example.org/a.jpg' },
      ],
      target: 'c',
    };
    const { draft, notes } = readAnnotation(annotation, LANGS);
    expect(draft.texts.note.en).toBe('One\n\nTwo\n\nGallia est omnis divisa');
    expect(notes).toEqual([
      { kind: 'motivations', values: ['classifying'] },
      { kind: 'bodies', count: 1 },
      { kind: 'joined', languages: ['en'] },
      { kind: 'language', from: ['la'], to: 'en' },
    ]);
  });

  it('reports nothing for an annotation the form keeps whole', () => {
    const draft = draftWith({ intent: 'note', texts: { label: {}, note: { en: 'Hello', cy: 'Helo' }, transcription: {}, tags: {} } });
    const annotation: Annotation = { id: 'x', type: 'Annotation', motivation: 'commenting', body: bodiesOfDraft(draft, LANGS), target: 'c' };
    expect(readAnnotation(annotation, LANGS).notes).toEqual([]);
  });
});
