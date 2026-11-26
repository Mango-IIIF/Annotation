<script lang="ts">
  import type { OverlayPoint, OverlayStyle, ProjectedOverlayShape } from './types';

  interface Props {
    /** Projected shapes in overlay coordinates (px or 0..100 percent). */
    shapes: ProjectedOverlayShape[];
    /** Viewport width in pixels (used for `units="px"`). */
    width?: number;
    /** Viewport height in pixels (used for `units="px"`). */
    height?: number;
    /** Coordinate system: `'px'` uses `0 0 width height`; `'percent'` uses `0 0 100 100`. */
    units?: 'px' | 'percent';
    /** Whether shapes accept pointer/keyboard interaction. Default true. */
    interactive?: boolean;
    /** How shape labels are rendered: `'svg'` (text below), `'pill'` (HTML badge below), or `'none'`. */
    labelMode?: 'svg' | 'pill' | 'none';
    /** How point shapes are rendered: `'svg'` (circle) or `'none'` (host renders HTML markers). */
    pointMode?: 'svg' | 'none';
    /** Accessible fallback label when a shape has no label or ariaLabel. */
    fallbackLabel?: string;
    /** Accessible label for the SVG root when non-interactive. */
    ariaLabel?: string;
    /** Extra CSS class applied to the root SVG element. */
    svgClass?: string;
    onhover?: (payload: { id: string | null }) => void;
    onselect?: (payload: { id: string }) => void;
  }

  let {
    shapes = [],
    width = 0,
    height = 0,
    units = 'px',
    interactive = true,
    labelMode = 'svg',
    pointMode = 'svg',
    fallbackLabel = 'Annotation',
    ariaLabel = undefined,
    svgClass = '',
    onhover = undefined,
    onselect = undefined,
  }: Props = $props();

  const pointsStr = (points: OverlayPoint[] | undefined): string =>
    (points ?? []).map((p) => `${p.x},${p.y}`).join(' ');

  const inlineStyle = (style: OverlayStyle | undefined, openPath = false): string | undefined => {
    if (!style) return undefined;
    const parts: string[] = [];
    if (style.raw) parts.push(style.raw.replace(/;\s*$/, ''));
    if (style.strokeColor) parts.push(`stroke: ${style.strokeColor}`);
    if (!openPath && style.fillColor) parts.push(`fill: ${style.fillColor}`);
    if (style.strokeWidth != null) parts.push(`stroke-width: ${style.strokeWidth}px`);
    if (style.opacity != null) parts.push(`opacity: ${style.opacity}`);
    return parts.length ? `${parts.join('; ')};` : undefined;
  };

  const accessibleName = (shape: ProjectedOverlayShape): string =>
    shape.ariaLabel?.trim() || shape.label?.trim() || fallbackLabel;

  const labelPos = (shape: ProjectedOverlayShape): { x: number; y: number } => ({
    x: shape.bounds.x + shape.bounds.width / 2,
    y: shape.bounds.y + shape.bounds.height + 14,
  });

  const handleKeydown = (event: KeyboardEvent, id: string) => {
    if (!interactive) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onselect?.({ id });
  };

  let svgViewBox = $derived(units === 'percent' ? '0 0 100 100' : `0 0 ${width} ${height}`);
  let ready = $derived(units === 'percent' || (width > 1 && height > 1));
</script>

{#if ready}
  <svg
    class="annotation-layer {svgClass}"
    width={units === 'px' ? width : undefined}
    height={units === 'px' ? height : undefined}
    viewBox={svgViewBox}
    preserveAspectRatio={units === 'percent' ? 'none' : undefined}
    aria-label={ariaLabel}
  >
    {#each shapes as shape (shape.id)}
      {#if shape.kind === 'rect' && shape.rect}
        {#if interactive}
          <rect
            class="annotation-layer__shape {shape.className ?? ''}"
            class:annotation-layer__shape--hit={shape.isHighlight}
            class:annotation-layer__shape--active={shape.isActive}
            class:annotation-layer__shape--hover={shape.isHover}
            class:annotation-layer__shape--dimmed={shape.isDimmed}
            x={shape.rect.x}
            y={shape.rect.y}
            width={shape.rect.width}
            height={shape.rect.height}
            style={inlineStyle(shape.style)}
            data-annotation-id={shape.id}
            role="button"
            tabindex="0"
            aria-label={accessibleName(shape)}
            aria-pressed={Boolean(shape.isActive)}
            onmouseenter={() => onhover?.({ id: shape.id })}
            onmouseleave={() => onhover?.({ id: null })}
            onclick={(event) => {
              event.stopPropagation();
              onselect?.({ id: shape.id });
            }}
            onkeydown={(event) => handleKeydown(event, shape.id)}
          >
            {#if shape.title}<title>{shape.title}</title>{/if}
          </rect>
        {:else}
          <rect
            class="annotation-layer__shape annotation-layer__shape--passive {shape.className ?? ''}"
            class:annotation-layer__shape--hit={shape.isHighlight}
            class:annotation-layer__shape--active={shape.isActive}
            class:annotation-layer__shape--dimmed={shape.isDimmed}
            x={shape.rect.x}
            y={shape.rect.y}
            width={shape.rect.width}
            height={shape.rect.height}
            style={inlineStyle(shape.style)}
            data-annotation-id={shape.id}
          />
        {/if}
      {:else if shape.kind === 'polyline' && shape.points?.length}
        {#if interactive}
          <polyline
            class="annotation-layer__shape annotation-layer__shape--polyline {shape.className ?? ''}"
            class:annotation-layer__shape--hit={shape.isHighlight}
            class:annotation-layer__shape--active={shape.isActive}
            class:annotation-layer__shape--hover={shape.isHover}
            class:annotation-layer__shape--dimmed={shape.isDimmed}
            points={pointsStr(shape.points)}
            style={inlineStyle(shape.style, true)}
            data-annotation-id={shape.id}
            role="button"
            tabindex="0"
            aria-label={accessibleName(shape)}
            aria-pressed={Boolean(shape.isActive)}
            onmouseenter={() => onhover?.({ id: shape.id })}
            onmouseleave={() => onhover?.({ id: null })}
            onclick={(event) => {
              event.stopPropagation();
              onselect?.({ id: shape.id });
            }}
            onkeydown={(event) => handleKeydown(event, shape.id)}
          >
            {#if shape.title}<title>{shape.title}</title>{/if}
          </polyline>
        {:else}
          <polyline
            class="annotation-layer__shape annotation-layer__shape--polyline annotation-layer__shape--passive {shape.className ?? ''}"
            class:annotation-layer__shape--hit={shape.isHighlight}
            class:annotation-layer__shape--active={shape.isActive}
            class:annotation-layer__shape--dimmed={shape.isDimmed}
            points={pointsStr(shape.points)}
            style={inlineStyle(shape.style, true)}
            data-annotation-id={shape.id}
          />
        {/if}
      {:else if shape.kind === 'polygon' && shape.points?.length}
        {#if interactive}
          <polygon
            class="annotation-layer__shape {shape.className ?? ''}"
            class:annotation-layer__shape--hit={shape.isHighlight}
            class:annotation-layer__shape--active={shape.isActive}
            class:annotation-layer__shape--hover={shape.isHover}
            class:annotation-layer__shape--dimmed={shape.isDimmed}
            points={pointsStr(shape.points)}
            style={inlineStyle(shape.style)}
            data-annotation-id={shape.id}
            role="button"
            tabindex="0"
            aria-label={accessibleName(shape)}
            aria-pressed={Boolean(shape.isActive)}
            onmouseenter={() => onhover?.({ id: shape.id })}
            onmouseleave={() => onhover?.({ id: null })}
            onclick={(event) => {
              event.stopPropagation();
              onselect?.({ id: shape.id });
            }}
            onkeydown={(event) => handleKeydown(event, shape.id)}
          >
            {#if shape.title}<title>{shape.title}</title>{/if}
          </polygon>
        {:else}
          <polygon
            class="annotation-layer__shape annotation-layer__shape--passive {shape.className ?? ''}"
            class:annotation-layer__shape--hit={shape.isHighlight}
            class:annotation-layer__shape--active={shape.isActive}
            class:annotation-layer__shape--dimmed={shape.isDimmed}
            points={pointsStr(shape.points)}
            style={inlineStyle(shape.style)}
            data-annotation-id={shape.id}
          />
        {/if}
      {:else if shape.kind === 'point' && shape.point && pointMode === 'svg'}
        {#if interactive}
          <circle
            class="annotation-layer__shape annotation-layer__shape--point {shape.className ?? ''}"
            class:annotation-layer__shape--hit={shape.isHighlight}
            class:annotation-layer__shape--active={shape.isActive}
            class:annotation-layer__shape--hover={shape.isHover}
            class:annotation-layer__shape--dimmed={shape.isDimmed}
            cx={shape.point.x}
            cy={shape.point.y}
            r="6"
            style={inlineStyle(shape.style)}
            data-annotation-id={shape.id}
            role="button"
            tabindex="0"
            aria-label={accessibleName(shape)}
            aria-pressed={Boolean(shape.isActive)}
            onmouseenter={() => onhover?.({ id: shape.id })}
            onmouseleave={() => onhover?.({ id: null })}
            onclick={(event) => {
              event.stopPropagation();
              onselect?.({ id: shape.id });
            }}
            onkeydown={(event) => handleKeydown(event, shape.id)}
          >
            {#if shape.title}<title>{shape.title}</title>{/if}
          </circle>
        {:else}
          <circle
            class="annotation-layer__shape annotation-layer__shape--point annotation-layer__shape--passive {shape.className ?? ''}"
            class:annotation-layer__shape--hit={shape.isHighlight}
            class:annotation-layer__shape--active={shape.isActive}
            class:annotation-layer__shape--dimmed={shape.isDimmed}
            cx={shape.point.x}
            cy={shape.point.y}
            r="6"
            style={inlineStyle(shape.style)}
            data-annotation-id={shape.id}
          />
        {/if}
      {/if}

      {#if labelMode === 'svg' && shape.label?.trim()}
        {@const pos = labelPos(shape)}
        <text
          class="annotation-layer__label"
          class:annotation-layer__label--dimmed={shape.isDimmed}
          x={pos.x}
          y={pos.y}
        >
          {shape.label.trim()}
        </text>
      {/if}
    {/each}
  </svg>

  {#if labelMode === 'pill'}
    {#each shapes as shape (shape.id)}
      {#if shape.label?.trim()}
        {@const pos = labelPos(shape)}
        <div
          class="annotation-layer__pill"
          class:annotation-layer__pill--dimmed={shape.isDimmed}
          style="left: {pos.x}px; top: {pos.y - 2}px;"
        >
          {shape.label.trim()}
        </div>
      {/if}
    {/each}
  {/if}
{/if}

<style>
  .annotation-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }

  .annotation-layer__shape {
    fill: rgba(42, 199, 255, 0.18);
    stroke: rgba(42, 199, 255, 0.92);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    transition:
      stroke 0.2s ease,
      fill 0.2s ease,
      opacity 0.2s ease;
    cursor: pointer;
    pointer-events: auto;
  }

  .annotation-layer__shape--passive {
    pointer-events: none;
    cursor: default;
  }

  .annotation-layer__shape--polyline {
    fill: none !important;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .annotation-layer__shape--hit {
    fill: var(--viewer-search-hit-fill, rgba(42, 199, 255, 0.25)) !important;
    stroke: var(--viewer-search-hit-border, rgba(42, 199, 255, 0.95)) !important;
  }

  .annotation-layer__shape--hover {
    opacity: 0.95;
  }

  .annotation-layer__shape--active {
    stroke-width: 3px;
  }

  .annotation-layer__shape--dimmed {
    opacity: 0.18;
  }

  .annotation-layer__label {
    font-size: 11px;
    fill: #f1f5f9;
    paint-order: stroke;
    stroke: rgba(10, 14, 20, 0.9);
    stroke-width: 3px;
    stroke-linejoin: round;
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
  }

  .annotation-layer__label--dimmed {
    opacity: 0.3;
  }

  .annotation-layer__pill {
    position: absolute;
    transform: translateX(-50%);
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(12, 16, 22, 0.84);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #f1f5f9;
    font-size: 11px;
    line-height: 1.2;
    max-width: min(220px, 60cqw);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .annotation-layer__pill--dimmed {
    opacity: 0.3;
  }
</style>
