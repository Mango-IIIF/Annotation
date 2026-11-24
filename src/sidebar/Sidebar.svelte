<script lang="ts">
  import {
    Check,
    Clock,
    Eye,
    Image,
    Link,
    MessageCircle,
    Pencil,
    Play,
    Scan,
    ScrollText,
    Star,
    Tag,
    Trash2,
    UserRound,
    X,
  } from '@lucide/svelte';
  import type { Snippet } from 'svelte';
  import { formatTime, parseTime } from '../annotations/time';
  import { t } from '../core/i18n';
  import AuthoritySearch from '../authorities/AuthoritySearch.svelte';
  import type { AuthorityProvider } from '../authorities/types';
  import {
    INTENTS,
    MOTIVATION_OF,
    TEXT_INTENTS,
    filledLanguages,
    type Draft,
    type Intent,
    type TextField,
  } from '../annotations/intents';
  import type { Annotation, Scope } from '../annotations/types';
  import type { Card, IdentifySnippetContext, SidebarVisibility } from './types';

  /**
   * The intent-first annotation form: what it is about, what you want to do,
   * then only the boxes that needs. Shared by images and audio/video.
   */
  interface Props {
    kind: 'image' | 'av';
    languages: string[];
    draft: Draft;
    language: string;
    /** Image: what the annotation is about. */
    scope?: Scope;
    /** Image: the selected shape's bounds, in image pixels. */
    region?: { x: number; y: number; w: number; h: number };
    /** Image: how many saved annotations the selected shape has. */
    regionCount?: number;
    drawing?: boolean;
    /** A/V: target range as strings of seconds; empty end means to the end. */
    start?: string;
    end?: string;
    currentTime?: number;
    playbackReady?: boolean;
    editing: boolean;
    error: string;
    providers: AuthorityProvider[];
    preview?: Annotation | null;
    cards: Card[];
    selectedId?: string | null;
    /** Set a section to false to omit it from the reusable sidebar. */
    visibility?: SidebarVisibility;
    assist?: Snippet;
    /** Replaces the built-in authority search for the Identify intent. */
    identify?: Snippet<[IdentifySnippetContext]>;
    ondrawbox?: () => void;
    oncanceldraw?: () => void;
    ondeleteshape?: () => void;
    oncleartarget?: () => void;
    onsave: () => void;
    oncancel: () => void;
    onedit: (id: string) => void;
    ondelete: (id: string) => void;
    onlocate: (id: string) => void;
  }

  let {
    kind,
    languages,
    draft = $bindable(),
    language = $bindable(),
    scope = $bindable('region'),
    region,
    regionCount = 0,
    drawing = false,
    start = $bindable('0'),
    end = $bindable(''),
    currentTime = 0,
    playbackReady = false,
    editing,
    error,
    providers,
    preview = null,
    cards,
    selectedId = null,
    visibility = {},
    assist,
    identify,
    ondrawbox,
    oncanceldraw,
    ondeleteshape,
    oncleartarget,
    onsave,
    oncancel,
    onedit,
    ondelete,
    onlocate,
  }: Props = $props();

  const ICONS = {
    note: MessageCircle,
    transcribe: ScrollText,
    tag: Tag,
    identify: UserRound,
    highlight: Star,
    link: Link,
  } as const;

  const languageName = (code: string) =>
    new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;

  let hasTarget = $derived(
    kind === 'av' ||
      visibility.selection === false ||
      scope !== 'region' ||
      Boolean(region) ||
      editing,
  );
  let filled = $derived(filledLanguages(draft, languages));
  let showLanguages = $derived(
    languages.length > 1 && draft.intent !== null && TEXT_INTENTS.includes(draft.intent),
  );
  let hint = $derived(
    draft.intent ? $t(`annotate.intents.${draft.intent}.hint.${kind}`) : '',
  );

  const pick = (intent: Intent) => (draft.intent = intent);

  const setText = (field: TextField, value: string) => {
    draft.texts[field][language] = value;
    // Typing makes a value the person's own.
    delete draft.generators[`${field}.${language}`];
  };

  const valueOf = (field: TextField) => draft.texts[field][language] ?? '';

  let startText = $state('');
  let endText = $state('');
  let startInvalid = $state(false);
  let endInvalid = $state(false);
  const timeId = $props.id();

  $effect(() => {
    startText = formatTime(Number(start), { fraction: true });
    startInvalid = false;
  });

  $effect(() => {
    endText = end === '' ? '' : formatTime(Number(end), { fraction: true });
    endInvalid = false;
  });

  const changeTime = (which: 'start' | 'end', text: string) => {
    const emptyEnd = which === 'end' && text.trim() === '';
    const seconds = emptyEnd ? null : parseTime(text);
    const invalid = !emptyEnd && seconds === null;
    const display = invalid ? text : emptyEnd ? '' : formatTime(seconds!, { fraction: true });
    if (which === 'start') {
      startText = display;
      startInvalid = invalid;
      if (!invalid) start = String(seconds);
    } else {
      endText = display;
      endInvalid = invalid;
      if (!invalid) end = emptyEnd ? '' : String(seconds);
    }
  };

  const useCurrentTime = (which: 'start' | 'end') => {
    changeTime(which, String(Math.round(currentTime)));
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (kind === 'av' && visibility.selection !== false && (startInvalid || endInvalid)) return;
    onsave();
  };
</script>

<aside class="anno-sidebar" aria-label={$t('annotate.sidebar.label')}>
  <form class="anno-form" onsubmit={submit} novalidate>
    {#if editing}
      <p class="anno-editing">
        <Pencil size={14} aria-hidden="true" />
        {$t('annotate.sidebar.editing')}
      </p>
    {/if}

    {#if visibility.selection !== false && kind === 'image'}
      {#if !hasTarget}
        <div class="anno-start" class:drawing>
          <p class="anno-start__prompt">
            <Scan size={18} aria-hidden="true" />
            <span>{drawing ? $t('annotate.region.drawingShort') : $t('annotate.region.start')}</span>
          </p>
          <div class="anno-start__actions">
            {#if drawing && oncanceldraw}
              <button type="button" class="anno-secondary anno-start__primary" onclick={() => oncanceldraw?.()}>
                {$t('annotate.region.cancelDraw')}
              </button>
            {:else}
              <button type="button" class="anno-primary anno-start__primary" onclick={() => ondrawbox?.()}>
                {$t('annotate.region.draw')}
              </button>
            {/if}
            <button
              type="button"
              class="anno-start__whole"
              onclick={() => {
                oncanceldraw?.();
                scope = 'canvas';
              }}
            >
              <Image size={15} aria-hidden="true" />
              {$t('annotate.scope.wholeImageAction')}
            </button>
          </div>
        </div>
      {:else if scope === 'region'}
        <div class="anno-target" class:selected={region} class:empty={!region}>
          <div class="anno-target__info">
            <Scan size={16} aria-hidden="true" />
            <div class="anno-target__text">
              {#if region}
                <span class="anno-target__title">{$t('annotate.region.selectedTitle')}</span>
                <span class="anno-target__meta">
                  {$t('annotate.region.dimensions', { w: Math.round(region.w), h: Math.round(region.h) })}{#if regionCount}{' · '}{$t('annotate.region.count', { count: regionCount })}{/if}
                </span>
              {:else if drawing}
                <span class="anno-target__title">{$t('annotate.region.drawingShort')}</span>
              {:else}
                <span class="anno-target__title">{$t('annotate.region.none')}</span>
              {/if}
            </div>
          </div>
          <div class="anno-target__actions">
            {#if drawing && !region && oncanceldraw}
              <button type="button" class="anno-region__draw" onclick={() => oncanceldraw?.()}>
                {$t('annotate.region.cancelDraw')}
              </button>
            {:else}
              <button type="button" class="anno-region__draw" onclick={() => ondrawbox?.()}>
                {region ? $t('annotate.region.redraw') : $t('annotate.region.draw')}
              </button>
            {/if}
            {#if region}
              <button
                type="button"
                class="anno-region__icon"
                aria-label={$t('annotate.region.delete')}
                title={$t('annotate.region.delete')}
                onclick={() => ondeleteshape?.()}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
              {#if !editing && oncleartarget}
                <button
                  type="button"
                  class="anno-region__icon"
                  aria-label={$t('annotate.region.clear')}
                  title={$t('annotate.region.clear')}
                  onclick={() => oncleartarget?.()}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              {/if}
            {/if}
          </div>
        </div>
      {:else}
        <div class="anno-target selected">
          <div class="anno-target__info">
            <Image size={16} aria-hidden="true" />
            <span class="anno-target__title">{$t(`annotate.scope.short.${scope}`)}</span>
          </div>
          <button type="button" class="anno-subtle" onclick={() => (scope = 'region')}>
            {$t('annotate.scope.switchToArea')}
          </button>
        </div>
      {/if}
    {:else if visibility.selection !== false}
      <div class="anno-times">
        <label>
          {$t('annotate.time.start')}
          <input
            class="anno-input"
            type="text"
            inputmode="decimal"
            aria-label={$t('annotate.time.start')}
            aria-invalid={startInvalid}
            aria-describedby={startInvalid ? timeId + '-start-format' : undefined}
            bind:value={startText}
            onchange={(event) => changeTime('start', event.currentTarget.value)}
          />
          {#if startInvalid}
            <span id={timeId + '-start-format'} class="anno-error" role="alert">{$t('annotate.time.format')}</span>
          {/if}
          <button type="button" class="anno-subtle" disabled={!playbackReady} onclick={() => useCurrentTime('start')}>
            <Clock size={14} aria-hidden="true" />
            {$t('annotate.time.useCurrent')}
          </button>
        </label>
        <label>
          {$t('annotate.time.end')}
          <input
            class="anno-input"
            type="text"
            inputmode="decimal"
            aria-label={$t('annotate.time.end')}
            aria-invalid={endInvalid}
            aria-describedby={endInvalid ? timeId + '-end-format' : undefined}
            bind:value={endText}
            onchange={(event) => changeTime('end', event.currentTarget.value)}
          />
          {#if endInvalid}
            <span id={timeId + '-end-format'} class="anno-error" role="alert">{$t('annotate.time.format')}</span>
          {/if}
          <button type="button" class="anno-subtle" disabled={!playbackReady} onclick={() => useCurrentTime('end')}>
            <Clock size={14} aria-hidden="true" />
            {$t('annotate.time.useCurrent')}
          </button>
        </label>
      </div>
    {/if}

    {#if hasTarget}
    {#if visibility.intents !== false}
    <div class="anno-group">
      <span class="anno-field-label" id="anno-intent-label">{$t('annotate.intents.question')}</span>
      <div class="anno-intents" role="group" aria-labelledby="anno-intent-label">
        {#each INTENTS as intent (intent)}
          {@const Icon = ICONS[intent]}
          <button
            type="button"
            aria-pressed={draft.intent === intent}
            onclick={() => pick(intent)}
          >
            <Icon size={22} aria-hidden="true" />
            {$t(`annotate.intents.${intent}.label`)}
          </button>
        {/each}
      </div>
      {#if hint}
        <p class="anno-hint">{hint}</p>
      {/if}
    </div>
    {/if}

    {#if visibility.assist !== false && kind === 'image'}{@render assist?.()}{/if}

    {#if visibility.languages !== false && showLanguages}
      <div class="anno-segmented anno-languages" role="group" aria-label={$t('annotate.sidebar.language')}>
        {#each languages as code (code)}
          <button type="button" aria-pressed={language === code} lang={code} onclick={() => (language = code)}>
            {languageName(code)}
            {#if filled.includes(code) && language !== code}
              <Check size={14} aria-label={$t('annotate.sidebar.hasText')} />
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if visibility.editor !== false && draft.intent === 'note'}
      <label class="anno-field">
        <span class="anno-field-label">
          {$t('annotate.fields.title')}
          <span class="anno-field-meta">{languageName(language)} · {$t('annotate.fields.optional')}</span>
        </span>
        <input
          class="anno-input"
          type="text"
          lang={language}
          placeholder={$t('annotate.fields.titlePlaceholder')}
          value={valueOf('label')}
          oninput={(event) => setText('label', event.currentTarget.value)}
        />
      </label>
      <label class="anno-field">
        <span class="anno-field-label">
          {$t('annotate.fields.note')}
          <span class="anno-field-meta">{languageName(language)}</span>
        </span>
        <textarea
          class="anno-input"
          rows="5"
          lang={language}
          placeholder={$t('annotate.fields.notePlaceholder')}
          value={valueOf('note')}
          oninput={(event) => setText('note', event.currentTarget.value)}
        ></textarea>
      </label>
    {:else if visibility.editor !== false && draft.intent === 'transcribe'}
      <label class="anno-field">
        <span class="anno-field-label">
          {$t('annotate.fields.transcription')}
          <span class="anno-field-meta">{languageName(language)}</span>
        </span>
        <textarea
          class="anno-input"
          rows="8"
          lang={language}
          placeholder={$t('annotate.fields.transcriptionPlaceholder')}
          value={valueOf('transcription')}
          oninput={(event) => setText('transcription', event.currentTarget.value)}
        ></textarea>
      </label>
    {:else if visibility.editor !== false && draft.intent === 'tag'}
      <label class="anno-field">
        <span class="anno-field-label">
          {$t('annotate.fields.tags')}
          <span class="anno-field-meta">{languageName(language)}</span>
        </span>
        <input
          class="anno-input"
          type="text"
          lang={language}
          placeholder={$t('annotate.fields.tagsPlaceholder')}
          value={valueOf('tags')}
          oninput={(event) => setText('tags', event.currentTarget.value)}
        />
      </label>
    {:else if visibility.editor !== false && draft.intent === 'identify'}
      {#if identify}
        {@render identify({
          value: draft.entities,
          onchange: (value) => (draft.entities = value),
          providers,
        })}
      {:else if providers.length}
        <AuthoritySearch {providers} value={draft.entities} onchange={(value) => (draft.entities = value)} />
      {:else}
        <p class="anno-muted">{$t('annotate.identify.none')}</p>
      {/if}
    {:else if visibility.editor !== false && draft.intent === 'highlight'}
      <label class="anno-field">
        <span class="anno-field-label">
          {$t('annotate.fields.why')}
          <span class="anno-field-meta">{languageName(language)} · {$t('annotate.fields.optional')}</span>
        </span>
        <input
          class="anno-input"
          type="text"
          lang={language}
          placeholder={$t('annotate.fields.whyPlaceholder')}
          value={valueOf('note')}
          oninput={(event) => setText('note', event.currentTarget.value)}
        />
      </label>
    {:else if visibility.editor !== false && draft.intent === 'link'}
      <label class="anno-field">
        <span class="anno-field-label">{$t('annotate.fields.linkUrl')}</span>
        <input
          class="anno-input"
          type="url"
          placeholder={$t('annotate.fields.linkUrlPlaceholder')}
          bind:value={draft.linkUrl}
        />
      </label>
      {#if kind === 'av'}
        <div class="anno-times">
          <label>
            {$t('annotate.fields.linkFrom')}
            <input class="anno-input" type="number" min="0" bind:value={draft.linkStart} />
          </label>
          <label>
            {$t('annotate.fields.linkTo')}
            <input class="anno-input" type="number" min="0" bind:value={draft.linkEnd} />
          </label>
        </div>
      {/if}
    {/if}

    {#if error}
      <p class="anno-error" role="alert">{error}</p>
    {/if}

    {#if visibility.actions !== false && draft.intent}
      <div class="anno-row">
        <button type="submit" class="anno-primary">
          {editing ? $t('annotate.sidebar.update') : $t('annotate.sidebar.save')}
        </button>
        {#if editing}
          <button type="button" class="anno-secondary" onclick={oncancel}>{$t('annotate.sidebar.cancel')}</button>
        {/if}
      </div>
    {/if}

    {#if visibility.preview !== false && preview}
      <details class="anno-json">
        <summary>
          {$t('annotate.sidebar.json')}
          <code>{MOTIVATION_OF[draft.intent ?? 'note']}</code>
        </summary>
        <pre>{JSON.stringify(preview, null, 2)}</pre>
      </details>
    {/if}
    {/if}
  </form>

  {#if visibility.annotations !== false}
  <section class="anno-cards" aria-labelledby="anno-cards-heading">
    <h3 id="anno-cards-heading">{$t('annotate.cards.heading', { count: cards.length })}</h3>
    {#if !cards.length}
      <p class="anno-muted">{$t(`annotate.cards.empty.${kind}`)}</p>
    {/if}
    {#each cards as card (card.annotation.id)}
      <article class="anno-card" class:selected={card.annotation.id === selectedId}>
        <span class="anno-card__eyebrow">{card.eyebrow}</span>
        {#if card.title}<strong>{card.title}</strong>{/if}
        {#if card.text && card.text !== card.title}<p>{card.text}</p>{/if}
        <div class="anno-row">
          {#if card.locate}
            <button type="button" class="anno-subtle" onclick={() => onlocate(card.annotation.id)}>
              {#if card.locate === 'jump'}
                <Play size={14} aria-hidden="true" /> {$t('annotate.cards.jump')}
              {:else}
                <Eye size={14} aria-hidden="true" /> {$t('annotate.cards.show')}
              {/if}
            </button>
          {/if}
          <button type="button" class="anno-subtle" onclick={() => onedit(card.annotation.id)}>
            <Pencil size={14} aria-hidden="true" /> {$t('annotate.cards.edit')}
          </button>
          <button type="button" class="anno-subtle" onclick={() => ondelete(card.annotation.id)}>
            <Trash2 size={14} aria-hidden="true" /> {$t('annotate.cards.delete')}
          </button>
        </div>
      </article>
    {/each}
  </section>
  {/if}
</aside>

<style>
  .anno-sidebar {
    display: flex;
    flex-direction: column;
    gap: 20px;
    height: 100%;
    min-height: 0;
    padding: 20px;
    overflow: auto;
    box-sizing: border-box;
    border-left: 1px solid var(--viewer-panel-border);
    background: var(--anno-surface);
    color: var(--viewer-text);
    font-size: 15px;
  }

  .anno-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .anno-editing {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--anno-accent);
    font-size: 13px;
    font-weight: 600;
  }

  .anno-hint,
  .anno-cards h3,
  .anno-card p {
    margin: 0;
  }

  .anno-group,
  .anno-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  :global(.anno-field-label) {
    font-size: 13px;
    font-weight: 600;
  }

  .anno-field-meta {
    margin-left: 4px;
    color: var(--viewer-muted);
    font-weight: 400;
  }

  .anno-segmented {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border-radius: 8px;
    background: var(--anno-tint);
  }

  .anno-segmented button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--viewer-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .anno-segmented button[aria-pressed='true'] {
    background: var(--anno-raised);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
    color: var(--viewer-text);
  }

  .anno-start {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border: 1px dashed var(--anno-dashed);
    border-radius: 10px;
    background: var(--anno-tint);
  }

  .anno-start.drawing {
    border-style: solid;
    border-color: var(--anno-accent);
  }

  .anno-start__prompt {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 0;
    color: var(--viewer-text);
    font-size: 13.5px;
    line-height: 1.45;
  }

  .anno-start__prompt :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--anno-accent);
  }

  .anno-start__actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .anno-start__primary {
    width: 100%;
    height: 38px;
    font-size: 14px;
  }

  .anno-start__whole {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 34px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--viewer-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .anno-start__whole:hover,
  .anno-start__whole:focus-visible {
    background: color-mix(in srgb, var(--anno-accent) 10%, transparent);
    color: var(--anno-accent);
  }

  .anno-target {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 8px 8px 12px;
    border: 1px solid var(--anno-accent);
    border-radius: 8px;
    background: var(--anno-tint);
    font-size: 13px;
    line-height: 1.35;
  }

  .anno-target.empty {
    border-style: dashed;
    border-color: var(--anno-dashed);
  }

  .anno-target__info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .anno-target__info :global(svg) {
    flex-shrink: 0;
    color: var(--anno-accent);
  }

  .anno-target__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .anno-target__title {
    font-weight: 600;
    color: var(--viewer-text);
  }

  .anno-target__meta {
    color: var(--viewer-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .anno-target__actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .anno-region__draw,
  .anno-region__icon {
    flex-shrink: 0;
    height: 30px;
    border: 1px solid var(--anno-accent);
    border-radius: 6px;
    background: var(--anno-raised);
    color: var(--anno-accent);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .anno-region__draw {
    padding: 0 9px;
  }

  .anno-region__icon {
    display: grid;
    place-items: center;
    width: 30px;
    border-color: transparent;
    background: transparent;
    color: var(--viewer-muted);
  }

  .anno-region__icon:hover,
  .anno-region__icon:focus-visible {
    background: color-mix(in srgb, var(--anno-accent) 12%, transparent);
    color: var(--anno-accent);
  }

  .anno-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .anno-intents {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .anno-intents button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 72px;
    border: 2px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-raised);
    color: var(--viewer-text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .anno-intents button[aria-pressed='true'] {
    border-color: var(--anno-accent);
    background: var(--anno-tint);
    color: var(--anno-accent);
  }

  .anno-hint {
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--anno-tint);
    font-size: 13px;
    line-height: 1.45;
  }

  :global(.anno-input) {
    box-sizing: border-box;
    width: 100%;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid var(--anno-input-border);
    border-radius: 6px;
    background: var(--anno-raised);
    color: var(--viewer-text);
    font: inherit;
    font-size: 15px;
    font-weight: 400;
  }

  textarea:global(.anno-input) {
    padding: 10px 12px;
    resize: vertical;
  }

  .anno-times {
    display: flex;
    gap: 12px;
  }

  .anno-times label {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }

  .anno-primary,
  .anno-secondary {
    height: 44px;
    padding: 0 20px;
    border-radius: 6px;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }

  .anno-primary {
    border: 0;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }

  .anno-secondary {
    height: 40px;
    padding: 0 14px;
    border: 1px solid var(--anno-accent);
    background: transparent;
    color: var(--anno-accent);
    font-size: 14px;
  }

  :global(.anno-subtle) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--anno-accent);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  :global(.anno-subtle:disabled) {
    color: var(--viewer-muted);
    cursor: default;
  }

  :global(.anno-muted) {
    margin: 0;
    color: var(--viewer-muted);
    font-size: 13px;
  }

  :global(.anno-error) {
    margin: 0;
    color: var(--viewer-danger);
    font-size: 14px;
  }

  :global(.anno-ai-flag) {
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
    font-size: 11px;
    font-weight: 700;
  }

  .anno-json summary {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .anno-json code {
    color: var(--anno-accent);
    font-family: ui-monospace, Menlo, Consolas, monospace;
  }

  .anno-json pre {
    margin: 8px 0 0;
    padding: 16px;
    overflow: auto;
    border-radius: 8px;
    background: var(--anno-code-bg);
    color: var(--anno-code-text);
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .anno-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid var(--viewer-panel-border);
  }

  .anno-cards h3 {
    font-size: 15px;
  }

  .anno-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-raised);
    font-size: 14px;
  }

  .anno-card.selected {
    border-color: var(--anno-accent);
  }

  .anno-card__eyebrow {
    color: var(--viewer-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .anno-card p {
    color: var(--viewer-muted);
    line-height: 1.45;
  }
</style>
