<script lang="ts">
  import {
    ChevronDown,
    Circle,
    GalleryHorizontal,
    Grip,
    LoaderCircle,
    Magnet,
    Minus,
    MousePointer2,
    Pentagon,
    ScissorsLineDashed,
    Slash,
    Sparkles,
    Spline,
    Square,
    WandSparkles,
    X,
  } from '@lucide/svelte';
  import { t } from '../core/i18n';
  import type { SamCommand, SamState, Tool } from './types';

  interface Props {
    tool: Tool;
    samState: SamState;
    samMode: 'add' | 'remove';
    autoSelect?: boolean;
    ontoolchange: (tool: Tool) => void;
    onsammode: (mode: 'add' | 'remove') => void;
    onsamcommand: (command: SamCommand) => void;
    /** Whether the page gallery is showing; undefined when there is none to show. */
    gallery?: boolean;
    ongallerytoggle?: () => void;
  }

  let {
    tool,
    samState,
    samMode,
    autoSelect = true,
    ontoolchange,
    onsammode,
    onsamcommand,
    gallery = undefined,
    ongallerytoggle = undefined,
  }: Props = $props();

  const BASIC = [
    { id: 'select', icon: MousePointer2 },
    { id: 'rectangle', icon: Square },
    { id: 'polygon', icon: Pentagon },
    { id: 'ellipse', icon: Circle },
    { id: 'path', icon: Spline },
    { id: 'line', icon: Slash },
  ] as const;

  const ALL_SMART = [
    { id: 'intelligent-scissors', icon: ScissorsLineDashed },
    { id: 'magnetic-cursor', icon: Magnet },
    { id: 'smart-select', icon: WandSparkles },
  ] as const;
  type SmartTool = (typeof ALL_SMART)[number]['id'];

  let smart = $derived(ALL_SMART.filter((entry) => autoSelect || entry.id !== 'smart-select'));
  let open = $state(false);
  let tab = $state<SmartTool>('intelligent-scissors');
  let position = $state({ x: 0, y: 0 });
  const panelId = `smart-tools-${Math.random().toString(36).slice(2)}`;

  const close = () => {
    open = false;
    ontoolchange('select');
  };

  const changeSamMode = (mode: 'add' | 'remove') => {
    if (tool === 'smart-select' && samMode === mode) {
      ontoolchange('select');
      return;
    }
    onsammode(mode);
    ontoolchange('smart-select');
  };

  const onDragStart = (event: PointerEvent) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onDragMove = (event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement;
    if (!handle.hasPointerCapture(event.pointerId)) return;
    position = {
      x: Math.max(-48, position.x + event.movementX),
      y: Math.max(-12, position.y + event.movementY),
    };
  };

  const onDragEnd = (event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };

  let samEnabled = $derived(tool === 'smart-select');
  let samCanFinish = $derived(
    samEnabled && samState.state === 'ready' && samState.hasSelection && !samState.busy,
  );
  let samBusy = $derived(samEnabled && samState.state === 'ready' && samState.busy);
</script>

<div class="anno-toolbar-wrap">
  <div class="anno-toolbar" role="toolbar" aria-label={$t('annotate.tools.label')}>
    {#each BASIC as entry (entry.id)}
      <button
        type="button"
        class="anno-tool"
        class:active={tool === entry.id}
        aria-pressed={tool === entry.id}
        aria-label={$t(`annotate.tools.${entry.id}`)}
        title={$t(`annotate.tools.${entry.id}`)}
        onclick={() => {
          open = false;
          ontoolchange(entry.id);
        }}
      >
        <entry.icon size={18} aria-hidden="true" />
      </button>
    {/each}
    <span class="anno-sep" aria-hidden="true"></span>
    <button
      type="button"
      class="anno-tool"
      class:active={open}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={$t('annotate.tools.smart')}
      title={$t('annotate.tools.smart')}
      onclick={() => {
        if (open) {
          close();
        } else {
          open = true;
          ontoolchange(tab);
        }
      }}
    >
      <Sparkles size={18} aria-hidden="true" />
    </button>
    {#if gallery !== undefined}
      <span class="anno-sep" aria-hidden="true"></span>
      <button
        type="button"
        class="anno-tool"
        class:active={gallery}
        aria-pressed={gallery}
        aria-label={gallery ? $t('annotate.gallery.hide') : $t('annotate.gallery.show')}
        title={gallery ? $t('annotate.gallery.hide') : $t('annotate.gallery.show')}
        onclick={() => ongallerytoggle?.()}
      >
        <GalleryHorizontal size={18} aria-hidden="true" />
      </button>
    {/if}
  </div>

  {#if open}
    <section
      class="anno-smart"
      id={panelId}
      aria-label={$t('annotate.tools.smart')}
      style:transform={`translate(${position.x}px, ${position.y}px)`}
    >
      <header class="anno-smart__header">
        <div
          class="anno-smart__drag"
          role="presentation"
          onpointerdown={onDragStart}
          onpointermove={onDragMove}
          onpointerup={onDragEnd}
        >
          <Grip size={15} aria-hidden="true" />
          <strong>{$t('annotate.tools.smart')}</strong>
        </div>
        <button
          type="button"
          class="anno-icon-btn"
          aria-label={$t('annotate.tools.closeSmart')}
          onclick={close}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      {#each smart as entry (entry.id)}
        <div>
          <button
            type="button"
            class="anno-smart__tab"
            aria-expanded={tab === entry.id}
            aria-controls={`${panelId}-${entry.id}`}
            onclick={() => {
              tab = entry.id;
              ontoolchange(entry.id);
            }}
          >
            <entry.icon size={17} aria-hidden="true" />
            <span>{$t(`annotate.tools.${entry.id}`)}</span>
            <ChevronDown size={14} class={tab === entry.id ? 'expanded' : ''} aria-hidden="true" />
          </button>

          {#if tab === entry.id}
            <div class="anno-smart__content" id={`${panelId}-${entry.id}`}>
              {#if entry.id !== 'smart-select'}
                <div class="anno-smart__explain">
                  <button
                    type="button"
                    class="anno-smart__toggle"
                    aria-pressed={tool === entry.id}
                    aria-label={$t('annotate.tools.enable', { tool: $t(`annotate.tools.${entry.id}`) })}
                    onclick={() => ontoolchange(tool === entry.id ? 'select' : entry.id)}
                  >
                    <entry.icon size={17} aria-hidden="true" />
                  </button>
                  <p>{$t(`annotate.tools.hints.${entry.id}`)}</p>
                </div>
                <p class="anno-hint">{$t(`annotate.tools.hints.${entry.id}More`)}</p>
              {:else if samState.state === 'unsupported'}
                <p role="status">{$t('annotate.sam.unsupported')}</p>
              {:else if samState.state === 'error'}
                <p class="anno-error" role="alert">
                  {$t('annotate.sam.error', { message: samState.message })}
                </p>
              {:else if samState.state === 'loading' || samState.state === 'idle'}
                <div role="status">
                  <p>{$t('annotate.sam.loading')}</p>
                  <progress
                    aria-label={$t('annotate.sam.download')}
                    value={samState.state === 'loading' ? samState.progress : 0}
                    max="1"
                  ></progress>
                  <p class="anno-hint">{$t('annotate.sam.cached')}</p>
                </div>
              {:else}
                <p class="anno-hint">{$t('annotate.sam.instructions')}</p>
                <div class="anno-smart__modes" role="group" aria-label={$t('annotate.sam.mode')}>
                  <div>
                    <button
                      type="button"
                      class="anno-smart__toggle"
                      aria-label={$t('annotate.sam.add')}
                      aria-pressed={samEnabled && samMode === 'add'}
                      onclick={() => changeSamMode('add')}
                    >
                      {#if samBusy}
                        <LoaderCircle size={22} class="anno-spin" aria-hidden="true" />
                      {:else}
                        <WandSparkles size={22} aria-hidden="true" />
                      {/if}
                    </button>
                    <span>{$t('annotate.sam.add')}</span>
                  </div>
                  <div>
                    <button
                      type="button"
                      class="anno-smart__toggle"
                      aria-label={$t('annotate.sam.remove')}
                      aria-pressed={samEnabled && samMode === 'remove'}
                      onclick={() => changeSamMode('remove')}
                    >
                      <Minus size={22} aria-hidden="true" />
                    </button>
                    <span>{$t('annotate.sam.remove')}</span>
                  </div>
                </div>
                <p class="anno-hint" role="status">
                  {samBusy
                    ? $t('annotate.sam.busy')
                    : samEnabled
                      ? $t('annotate.sam.shift')
                      : $t('annotate.sam.paused')}
                </p>
                <div class="anno-smart__actions">
                  <button type="button" disabled={!samCanFinish} onclick={() => onsamcommand('done')}>
                    {$t('annotate.sam.done')}
                  </button>
                  <button type="button" disabled={!samCanFinish} onclick={() => onsamcommand('reset')}>
                    {$t('annotate.sam.reset')}
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </section>
  {/if}
</div>

<style>
  /* Spans the image, stopping above the stage's controls, so the tools never cover them. */
  .anno-toolbar-wrap {
    position: absolute;
    top: 12px;
    bottom: calc(12px + var(--anno-controls-height, 0px));
    left: 12px;
    z-index: 20;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    pointer-events: none;
  }

  .anno-toolbar,
  .anno-smart {
    pointer-events: auto;
    background: var(--viewer-dock-button-bg, rgba(15, 20, 27, 0.95));
    border: 1px solid var(--viewer-dock-button-border, rgba(255, 255, 255, 0.12));
    box-shadow: var(--viewer-dock-button-shadow, 0 12px 24px rgba(0, 0, 0, 0.35));
    color: var(--viewer-text);
    border-radius: 10px;
  }

  .anno-toolbar {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 100%;
    padding: 4px;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .anno-tool {
    flex: none;
  }

  .anno-tool {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .anno-tool:hover {
    background: var(--viewer-toolbar-button-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .anno-tool.active {
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }

  .anno-sep {
    flex: none;
    height: 1px;
    margin: 3px 6px;
    background: var(--viewer-toolbar-separator, rgba(255, 255, 255, 0.14));
  }

  .anno-smart {
    width: 260px;
    max-height: 100%;
    overflow-y: auto;
    padding: 8px;
    font-size: 13px;
  }

  .anno-smart__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .anno-smart__drag {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 6px;
    padding: 4px;
    cursor: grab;
    touch-action: none;
  }

  .anno-icon-btn {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .anno-smart__tab {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 6px;
    border: 0;
    border-top: 1px solid var(--viewer-panel-border);
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .anno-smart__tab span {
    flex: 1;
  }

  .anno-smart__tab :global(.expanded) {
    transform: rotate(180deg);
  }

  .anno-smart__content {
    padding: 4px 6px 10px;
  }

  .anno-smart__content p {
    margin: 0 0 6px;
    line-height: 1.45;
  }

  .anno-smart__explain {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .anno-smart__toggle {
    display: grid;
    flex-shrink: 0;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .anno-smart__toggle[aria-pressed='true'] {
    border-color: var(--anno-accent);
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }

  .anno-smart__modes {
    display: flex;
    gap: 16px;
    margin: 6px 0;
  }

  .anno-smart__modes > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }

  .anno-smart__actions {
    display: flex;
    gap: 8px;
  }

  .anno-smart__actions button {
    flex: 1;
    height: 32px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .anno-smart__actions button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .anno-hint {
    color: var(--viewer-muted);
    font-size: 12px;
  }

  .anno-error {
    color: var(--viewer-danger);
  }

  progress {
    width: 100%;
  }

  :global(.anno-spin) {
    animation: anno-spin 1s linear infinite;
  }

  @keyframes anno-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Narrow stages are short too: the tools go in a row along the top instead. */
  @container anno-stage (width <= 520px) {
    .anno-toolbar-wrap {
      top: 8px;
      right: 8px;
      left: 8px;
      flex-direction: column;
    }

    .anno-toolbar {
      flex-direction: row;
      max-width: 100%;
      max-height: none;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .anno-sep {
      flex: none;
      width: 1px;
      height: auto;
      margin: 6px 3px;
    }

    .anno-smart {
      width: min(260px, 100%);
    }
  }
</style>
