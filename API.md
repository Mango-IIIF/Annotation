# API

## Imports

```ts
import {
  AnnotoriousEditor,
  AnnotationSidebar,
  AnnotationToolbar,
  emptyDraft,
} from '@mango-iiif/annotation';

import '@mango-iiif/annotation/annotorious.css';
import '@mango-iiif/annotation/style.css';
```

## `AnnotoriousEditor`

A framework-neutral facade over Annotorious for OpenSeadragon.

```ts
const editor = new AnnotoriousEditor({
  viewer,
  tool: 'select',
  drawingMode: 'click',
  annotations: [],
  extendedTools: true,
});
```

### Options

| Option | Type | Description |
| --- | --- | --- |
| `viewer` | `OpenSeadragon.Viewer` | Required OpenSeadragon viewer. |
| `annotations` | `Partial<ImageAnnotation>[]` | Initial annotations. |
| `tool` | `AnnotationTool` | Initial tool; defaults to `select`. |
| `drawingMode` | `DrawingMode` | Annotorious drawing mode. |
| `style` | `DrawingStyleExpression` | Annotorious drawing style. |
| `user` | `User` | Current annotation user. |
| `userSelectAction` | Annotorious select action | Controls selection behaviour. |
| `extendedTools` | `boolean` | Mount ellipse, path, line, scissors, and magnetic cursor tools. Defaults to `true`. |

### Data

```ts
editor.getAnnotations();
editor.getAnnotation(id);
editor.setAnnotations(annotations, replace?);
editor.addAnnotation(annotation);
editor.updateAnnotation(annotation);
editor.removeAnnotation(idOrAnnotation);
editor.clearAnnotations();
```

The data methods use Annotorious `ImageAnnotation` objects directly.

### Selection and drawing

```ts
editor.getSelected();
editor.select(idOrIds?, editable?);
editor.getTool();
editor.setTool(tool);
editor.setDrawingMode(mode);
editor.cancelDrawing();
editor.fitTo(id, padding?);
editor.setVisible(visible);
editor.setStyle(style);
editor.setUser(user);
```

### History

```ts
editor.canUndo();
editor.canRedo();
editor.undo();
editor.redo();
```

### Events

```ts
const off = editor.on('create', annotation => {});
editor.on('update', (annotation, previous) => {});
editor.on('delete', annotation => {});
editor.on('select', annotations => {});
editor.on('tool', tool => {});

off();
editor.off(event, listener);
```

Call `editor.destroy()` when the viewer integration is no longer needed.

## `AnnotationToolbar`

The Svelte drawing toolbar used by `@mango-iiif/annotate`.

```svelte
<AnnotationToolbar
  {tool}
  samState={{ state: 'unsupported' }}
  samMode="add"
  autoSelect={false}
  ontoolchange={(tool) => editor.setTool(tool)}
  onsammode={(mode) => {}}
  onsamcommand={(command) => {}}
/>
```

Supported tools are `select`, `rectangle`, `polygon`, `ellipse`, `path`,
`line`, `intelligent-scissors`, `magnetic-cursor`, and `smart-select`.
Smart Select requires the consumer to provide its SAM state and command
integration. Set `autoSelect={false}` when it is not available.

## `AnnotationSidebar`

The Svelte intent-first metadata sidebar used by `@mango-iiif/annotate`.

```svelte
<script lang="ts">
  import { AnnotationSidebar, emptyDraft } from '@mango-iiif/annotation';

  let draft = $state(emptyDraft());
  let language = $state('en');
</script>

<AnnotationSidebar
  kind="image"
  languages={['en']}
  bind:draft
  bind:language
  editing={false}
  error=""
  providers={[]}
  cards={[]}
  onsave={() => save(draft)}
  oncancel={() => {}}
  onedit={(id) => {}}
  ondelete={(id) => {}}
  onlocate={(id) => {}}
/>
```

### Visibility

The `visibility` prop can omit individual sections:

```svelte
<AnnotationSidebar
  visibility={{ assist: false, preview: false, annotations: false }}
  {...props}
/>
```

Available keys are `selection`, `intents`, `assist`, `languages`, `editor`,
`actions`, `preview`, and `annotations`.

### Authority providers

Pass `AuthorityProvider[]` to use the built-in Identify search interface:

```ts
const providers = [{
  id: 'catalogue',
  label: 'Catalogue',
  placeholder: 'Search the catalogue…',
  async search(query: string, signal?: AbortSignal) {
    const response = await fetch(
      `/api/entities?q=${encodeURIComponent(query)}`,
      { signal },
    );
    return response.json();
  },
}];
```

Each result is an `AuthorityEntity`:

```ts
interface AuthorityEntity {
  provider: string;
  id: string;
  uri: string;
  label: string;
  description?: string;
  generator?: string;
}
```

### Custom Identify snippet

The `identify` snippet replaces the built-in authority search for the Identify
intent:

```svelte
{#snippet identify({ value, onchange, providers })}
  <EntityPicker
    selected={value}
    {providers}
    onselectedchange={onchange}
  />
{/snippet}

<AnnotationSidebar {identify} {...props} />
```

Its context is exported as `IdentifySnippetContext`:

```ts
interface IdentifySnippetContext {
  value: AuthorityEntity[];
  onchange: (value: AuthorityEntity[]) => void;
  providers: AuthorityProvider[];
}
```

Call `onchange` with the complete next selection. The sidebar writes it to
`draft.entities` and retains its normal save flow.

### Assist snippet

The optional `assist` snippet is rendered between the intent picker and form
fields for image annotations:

```svelte
{#snippet assist()}
  <MyImageAssistant />
{/snippet}

<AnnotationSidebar {assist} {...props} />
```

## Locale

```ts
import { getLocale, locale, setLocale, translate } from '@mango-iiif/annotation';

setLocale('fr');
getLocale();
translate('annotate.sidebar.save');
```

Bundled locales are English, Spanish, Welsh, French, and Japanese.
