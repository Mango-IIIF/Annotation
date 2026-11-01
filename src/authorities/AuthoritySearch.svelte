<script lang="ts">
  import { X } from '@lucide/svelte';
  import { t } from '../core/i18n';
  import type { AuthorityEntity, AuthorityProvider } from './types';

  interface Props {
    providers: AuthorityProvider[];
    value: AuthorityEntity[];
    onchange: (value: AuthorityEntity[]) => void;
  }

  let { providers, value, onchange }: Props = $props();

  const MIN_QUERY_LENGTH = 2;
  const SEARCH_DELAY_MS = 350;

  let providerId = $state('');
  let provider = $derived(providers.find((p) => p.id === providerId) ?? providers[0]);
  let query = $state('');
  let results = $state.raw<AuthorityEntity[]>([]);
  let busy = $state(false);
  let error = $state('');

  /* Debounced; a newer query or provider cancels the request in flight. */
  $effect(() => {
    const current = provider;
    const text = query.trim();
    results = [];
    error = '';
    if (!current || text.length < MIN_QUERY_LENGTH) {
      busy = false;
      return;
    }
    busy = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const found = await current.search(text, controller.signal);
        if (!controller.signal.aborted) results = found;
      } catch (reason) {
        if (!controller.signal.aborted) {
          error = reason instanceof Error ? reason.message : String(reason);
        }
      } finally {
        if (!controller.signal.aborted) busy = false;
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  let available = $derived(results.filter((r) => !value.some((entity) => entity.uri === r.uri)));
  let noResults = $derived(query.trim().length >= MIN_QUERY_LENGTH && !busy && !error && !results.length);

  const choose = (entity: AuthorityEntity) => {
    onchange([...value, entity]);
    query = '';
  };
</script>

<div class="authority">
  <span class="anno-field-label">{$t('annotate.identify.question')}</span>
  {#if providers.length > 1}
    <div class="authority__providers" role="group" aria-label={$t('annotate.identify.source')}>
      {#each providers as option (option.id)}
        <button
          type="button"
          aria-pressed={option.id === provider?.id}
          onclick={() => (providerId = option.id)}
        >
          {option.label}
        </button>
      {/each}
    </div>
  {/if}

  {#if provider}
    <input
      type="search"
      class="anno-input"
      aria-label={$t('annotate.identify.search', { provider: provider.label })}
      placeholder={provider.placeholder ?? $t('annotate.identify.placeholder')}
      bind:value={query}
    />
  {/if}

  {#if busy}
    <p class="anno-muted" role="status">{$t('annotate.identify.searching', { provider: provider?.label })}</p>
  {/if}
  {#if error}
    <p class="anno-error" role="alert">{error}</p>
  {/if}
  {#if noResults}
    <p class="anno-muted">{$t('annotate.identify.noResults')}</p>
  {/if}

  {#if available.length}
    <ul class="authority__results">
      {#each available as result (result.uri)}
        <li>
          <button type="button" onclick={() => choose(result)}>
            <strong>{result.label} <small>{result.id}</small></strong>
            {#if result.description}<span>{result.description}</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if value.length}
    <ul class="authority__selected" aria-label={$t('annotate.identify.linked')}>
      {#each value as entity (entity.uri)}
        <li>
          <a href={entity.uri} target="_blank" rel="noreferrer">{entity.label}</a>
          <small>{entity.id}</small>
          {#if entity.generator}
            <span class="anno-ai-flag" title={$t('annotate.ai.suggestedBy', { model: entity.generator })}>{$t('annotate.ai.flag')}</span>
          {/if}
          <button
            type="button"
            class="authority__remove"
            aria-label={$t('annotate.identify.remove', { label: entity.label })}
            onclick={() => onchange(value.filter((selected) => selected.uri !== entity.uri))}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .authority {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .authority__providers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: 8px;
  }

  .authority__providers button {
    height: 40px;
    border: 1px solid var(--anno-accent);
    border-radius: 6px;
    background: transparent;
    color: var(--anno-accent);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .authority__providers button[aria-pressed='true'] {
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .authority__results button {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  .authority__results button:hover {
    border-color: var(--anno-accent);
  }

  .authority__results small,
  .authority__selected small {
    color: var(--viewer-muted);
    font-weight: 400;
  }

  .authority__results span {
    color: var(--viewer-muted);
    font-size: 13px;
  }

  .authority__selected li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--anno-tint);
    font-size: 14px;
  }

  .authority__selected a {
    color: var(--anno-accent);
    font-weight: 600;
  }

  .authority__remove {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    margin-left: auto;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
</style>
