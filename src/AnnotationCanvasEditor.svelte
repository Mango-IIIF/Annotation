<script lang="ts">
  import { untrack } from 'svelte';
  import type OpenSeadragon from 'openseadragon';
  import type {
    DrawingMode,
    DrawingStyleExpression,
    ImageAnnotation,
  } from '@annotorious/openseadragon';
  import {
    AnnotoriousEditor,
    type AnnotationTool,
    type AnnotoriousEditorOptions,
  } from './annotorious-editor';

  /**
   * Shared Svelte 5 OpenSeadragon canvas editor backed by `AnnotoriousEditor`.
   *
   * Used by both Lychee and Papaya so interactive drawing, selection, undo/redo,
   * and local-vs-remote store syncing live in one place.
   */
  interface Props {
    viewer?: OpenSeadragon.Viewer | null;
    enabled?: boolean;
    annotations?: ImageAnnotation[];
    selectedId?: string | null;
    tool?: AnnotationTool;
    drawingMode?: DrawingMode;
    style?: DrawingStyleExpression<ImageAnnotation>;
    userSelectAction?: AnnotoriousEditorOptions['userSelectAction'];
    extendedTools?: boolean;
    pointRadius?: number;
    oncreate?: (annotation: ImageAnnotation) => void;
    onupdate?: (annotation: ImageAnnotation, previous?: ImageAnnotation) => void;
    ondelete?: (id: string) => void;
    onselect?: (id: string | undefined) => void;
    onready?: (editor: AnnotoriousEditor | null) => void;
  }

  let {
    viewer = null,
    enabled = true,
    annotations = [],
    selectedId = null,
    tool = 'select',
    drawingMode = 'click',
    style = undefined,
    userSelectAction = undefined,
    extendedTools = true,
    pointRadius = undefined,
    oncreate = undefined,
    onupdate = undefined,
    ondelete = undefined,
    onselect = undefined,
    onready = undefined,
  }: Props = $props();

  let editor = $state.raw<AnnotoriousEditor | null>(null);
  let lastAnnotationsKey = '';

  $effect(() => {
    if (!enabled || !viewer) return;
    const instance = untrack(
      () =>
        new AnnotoriousEditor({
          viewer,
          annotations,
          tool,
          drawingMode,
          style,
          userSelectAction,
          extendedTools,
          pointRadius,
        }),
    );

    const offLocal = instance.onLocalChange(({ created = [], updated = [], deleted = [] }) => {
      for (const item of created) oncreate?.(item);
      for (const { newValue, oldValue } of updated) onupdate?.(newValue, oldValue);
      for (const item of deleted) ondelete?.(item.id);
    });

    const offSelect = instance.on('select', (selected) => {
      onselect?.(selected[0]?.id);
    });

    const initialSelection = untrack(() => selectedId);
    if (initialSelection && instance.getAnnotation(initialSelection)) {
      instance.select(initialSelection);
    }

    lastAnnotationsKey = JSON.stringify(untrack(() => annotations));
    editor = instance;
    onready?.(instance);

    const destroyOnViewer = () => {
      instance.destroy();
    };
    viewer.addHandler?.('before-destroy', destroyOnViewer);

    return () => {
      viewer.removeHandler?.('before-destroy', destroyOnViewer);
      offLocal();
      offSelect();
      onready?.(null);
      instance.destroy();
      if (editor === instance) editor = null;
      lastAnnotationsKey = '';
    };
  });

  $effect(() => {
    const instance = editor;
    if (!instance) return;
    const nextKey = JSON.stringify(annotations);
    if (nextKey !== lastAnnotationsKey) {
      lastAnnotationsKey = nextKey;
      instance.setAnnotations(annotations, true);
    }
  });

  $effect(() => {
    const instance = editor;
    if (!instance) return;
    const current = instance.getSelected()[0]?.id;
    const target = selectedId && instance.getAnnotation(selectedId) ? selectedId : undefined;
    if (current !== target) instance.select(target);
  });

  $effect(() => {
    editor?.setTool(tool);
  });

  $effect(() => {
    editor?.setStyle(style);
  });

  $effect(() => {
    editor?.setDrawingMode(drawingMode);
  });
</script>
