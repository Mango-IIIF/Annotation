<script lang="ts">
  import { onMount } from 'svelte';
  import OpenSeadragon from 'openseadragon';
  import Sidebar from '../src/sidebar/Sidebar.svelte';
  import Toolbar from '../src/toolbar/Toolbar.svelte';
  import type { Tool } from '../src/toolbar/types';
  import { emptyDraft } from '../src/annotations/intents';
  import type { Annotation } from '../src/annotations/types';
  import type { Card } from '../src/sidebar/types';
  import { AnnotoriousEditor } from '../src/annotorious-editor';
  import '@annotorious/openseadragon/annotorious-openseadragon.css';

  let editor: AnnotoriousEditor | undefined;
  let draft = $state(emptyDraft());
  let language = $state('en');
  let scope = $state<'region' | 'canvas'>('region');
  let selectedId = $state<string | null>(null);
  let region = $state<{ x: number; y: number; w: number; h: number } | undefined>();
  let cards = $state<Card[]>([]);
  let error = $state('');
  let tool = $state<Tool>('select');

  const demoEntities = [
    { provider: 'demo', id: 'ada', uri: 'https://www.wikidata.org/wiki/Q7259', label: 'Ada Lovelace', description: 'Mathematician and writer' },
    { provider: 'demo', id: 'turing', uri: 'https://www.wikidata.org/wiki/Q7251', label: 'Alan Turing', description: 'Mathematician and computer scientist' },
  ];

  const selectedBounds = () => {
    const selected = selectedId ? editor?.annotator.state.store.getAnnotation(selectedId) : undefined;
    const bounds = selected?.target.selector.geometry.bounds;
    region = bounds ? { x: bounds.minX, y: bounds.minY, w: bounds.maxX - bounds.minX, h: bounds.maxY - bounds.minY } : undefined;
  };

  const save = () => {
    if (!draft.intent) { error = 'Choose what you would like to do.'; return; }
    const id = crypto.randomUUID();
    const value = draft.texts.note[language] || draft.texts.transcription[language] || draft.texts.tags[language] || draft.linkUrl;
    const annotation: Annotation = { id, type: 'Annotation', motivation: 'commenting', target: selectedId ?? 'canvas' };
    cards = [...cards, { annotation, title: draft.texts.label[language] || draft.intent, text: value, eyebrow: draft.intent, locate: selectedId ? 'show' : undefined }];
    draft = emptyDraft(); error = '';
  };

  onMount(() => {
    const viewer = OpenSeadragon({
      id: 'viewer',
      prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
      tileSources: { type: 'image', url: 'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2/full/1200,/0/default.jpg' },
      showNavigator: true,
      gestureSettingsMouse: { clickToZoom: false },
    });
    editor = new AnnotoriousEditor({ viewer, drawingMode: 'click', style: { stroke: '#0f766e', strokeWidth: 2, fill: '#14b8a6', fillOpacity: 0.18 } });
    editor.on('tool', (next) => tool = next as Tool);
    editor.on('select', (annotations) => { selectedId = annotations[0]?.id ?? null; selectedBounds(); });
    editor.on('create', (annotation) => { selectedId = annotation.id; selectedBounds(); editor?.setTool('select'); });
    editor.on('update', selectedBounds);
    editor.on('delete', () => { selectedId = null; region = undefined; });
    Object.assign(window, { annotationEditor: editor });
    return () => { editor?.destroy(); viewer.destroy(); };
  });
</script>

{#snippet identify({ value, onchange })}
  <div class="demo-authorities">
    <span class="anno-field-label">Choose a person</span>
    {#each demoEntities as entity}
      {@const selected = value.some((item) => item.uri === entity.uri)}
      <button
        type="button"
        aria-pressed={selected}
        onclick={() => onchange(selected
          ? value.filter((item) => item.uri !== entity.uri)
          : [...value, entity])}
      >
        <strong>{entity.label}</strong>
        <span>{entity.description}</span>
      </button>
    {/each}
  </div>
{/snippet}

<main class="demo">
  <section class="demo__stage">
    <div id="viewer" aria-label="Image annotation viewer"></div>
    <Toolbar
      {tool}
      samState={{ state: 'unsupported' }}
      samMode="add"
      autoSelect={false}
      ontoolchange={(next) => { tool = next; editor?.setTool(next); }}
      onsammode={() => {}}
      onsamcommand={() => {}}
    />
  </section>
  <Sidebar
    kind="image"
    languages={['en']}
    bind:draft
    bind:language
    bind:scope
    {region}
    regionCount={selectedId ? cards.length : 0}
    drawing={tool !== 'select'}
    editing={false}
    {error}
    providers={[]}
    {identify}
    preview={null}
    {cards}
    {selectedId}
    ondrawbox={() => editor?.setTool('rectangle')}
    ondeleteshape={() => selectedId && editor?.removeAnnotation(selectedId)}
    onsave={save}
    oncancel={() => {}}
    onedit={() => {}}
    ondelete={(id) => cards = cards.filter((card) => card.annotation.id !== id)}
    onlocate={() => selectedId && editor?.fitTo(selectedId)}
  />
</main>
