import {
  createOSDAnnotator,
  type DrawingMode,
  type DrawingStyleExpression,
  type ImageAnnotation,
  type AnnotoriousOSDOpts,
  type OpenSeadragonAnnotator,
  type User,
} from '@annotorious/openseadragon';
import type OpenSeadragon from 'openseadragon';
import { mountPlugin as mountSelectorPack } from '@annotorious/plugin-tools';
import '@annotorious/plugin-tools/annotorious-plugin-tools.css';
import '@annotorious/plugin-magnetic-outline/plugin-magnetic-outline.css';
import { newId } from './annotations/model';
import { createPointImageAnnotation } from './annotations/w3c';

export type AnnotationTool = 'select' | (string & {});

export interface AnnotoriousEditorEvents {
  create: (annotation: ImageAnnotation) => void;
  update: (annotation: ImageAnnotation, previous: ImageAnnotation) => void;
  delete: (annotation: ImageAnnotation) => void;
  select: (annotations: ImageAnnotation[]) => void;
  tool: (tool: AnnotationTool) => void;
}

export interface LocalStoreChanges {
  created?: ImageAnnotation[];
  updated?: Array<{ oldValue?: ImageAnnotation; newValue: ImageAnnotation }>;
  deleted?: ImageAnnotation[];
}

export interface AnnotoriousEditorOptions {
  viewer: OpenSeadragon.Viewer;
  annotations?: Partial<ImageAnnotation>[];
  tool?: AnnotationTool;
  drawingMode?: DrawingMode;
  style?: DrawingStyleExpression<ImageAnnotation>;
  user?: User;
  userSelectAction?: AnnotoriousOSDOpts<ImageAnnotation, ImageAnnotation>['userSelectAction'];
  /** Mount ellipse, path, line, scissors, and magnetic cursor tools. Default true. */
  extendedTools?: boolean;
  /**
   * Clicking empty canvas while a shape is selected and a drawing tool is active
   * deselects and starts drawing immediately rather than requiring a second click.
   * Default true.
   */
  deselectOnDrawPress?: boolean;
  /** Default radius (in image pixels) for annotations created with the `point` tool. */
  pointRadius?: number;
}

type EventName = keyof AnnotoriousEditorEvents;

const ORIGIN_LOCAL = 'LOCAL';

const ANNOTORIOUS_DRAW_TOOLS = new Set<string>([
  'rectangle',
  'polygon',
  'ellipse',
  'path',
  'line',
  'intelligent-scissors',
  'magnetic-cursor',
]);

/**
 * Small, framework-neutral facade over Annotorious for OpenSeadragon.
 *
 * The facade deliberately keeps Annotorious' native annotation model. This
 * avoids a lossy second model and makes plugins and W3C format adapters usable
 * without conversion at the package boundary.
 */
export class AnnotoriousEditor {
  readonly annotator: OpenSeadragonAnnotator;
  readonly viewer: OpenSeadragon.Viewer;
  private tool: AnnotationTool = 'select';
  private destroyed = false;
  private listeners = new Map<EventName, Set<(...args: any[]) => void>>();
  private annotoriousListeners: Array<[string, (...args: any[]) => void]> = [];
  private localObservers = new Set<(event: { changes: LocalStoreChanges }) => void>();
  private magneticReady?: Promise<void>;
  private extendedTools: boolean;
  private deselectOnDrawPress: boolean;
  private pointRadius?: number;

  constructor(options: AnnotoriousEditorOptions) {
    this.viewer = options.viewer;
    this.pointRadius = options.pointRadius;
    this.deselectOnDrawPress = options.deselectOnDrawPress !== false;

    this.annotator = createOSDAnnotator(options.viewer, {
      ...(options.drawingMode ? { drawingMode: options.drawingMode } : {}),
      ...(options.style ? { style: options.style } : {}),
      ...(options.userSelectAction ? { userSelectAction: options.userSelectAction } : {}),
    });

    this.extendedTools = options.extendedTools !== false;
    if (this.extendedTools) mountSelectorPack(this.annotator);

    if (options.user) this.annotator.setUser(options.user);
    if (options.annotations) this.annotator.setAnnotations(options.annotations, true);

    this.forward('createAnnotation', 'create');
    this.forward('updateAnnotation', 'update');
    this.forward('deleteAnnotation', 'delete');
    this.forward('selectionChanged', 'select');

    if (this.deselectOnDrawPress) {
      this.viewer.element?.addEventListener('pointerdown', this.onPointerDown, true);
    }
    this.viewer.addHandler?.('canvas-click', this.onCanvasClick as never);

    this.setTool(options.tool ?? 'select');
  }

  private forward(source: string, target: EventName): void {
    const listener = (...args: any[]) => this.emit(target, ...args);
    this.annotator.on(source as never, listener as never);
    this.annotoriousListeners.push([source, listener]);
  }

  private emit(event: EventName, ...args: any[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  /**
   * While a shape is selected Annotorious shows its editor in place of the drawing tool, so
   * a press on empty image would only deselect and the user would have to click again to
   * draw. Deselect on the press instead, and replay it to the tool once it has mounted.
   */
  private onPointerDown = (event: PointerEvent): void => {
    const layer = event.target as Element | null;
    if (
      this.destroyed ||
      !event.isTrusted ||
      !ANNOTORIOUS_DRAW_TOOLS.has(this.tool) ||
      !layer?.classList?.contains('a9s-osd-drawinglayer') ||
      this.annotator.getSelected().length === 0
    ) {
      return;
    }
    this.annotator.setSelected(undefined);
    queueMicrotask(() => {
      if (this.destroyed) return;
      layer.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          button: event.button,
          buttons: event.buttons,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          cancelable: true,
        }),
      );
    });
  };

  /** Places a point-marker annotation on a quick canvas click when `tool === 'point'`. */
  private onCanvasClick = (event: { quick?: boolean; position?: OpenSeadragon.Point }): void => {
    if (this.destroyed || this.tool !== 'point' || !event.quick || !event.position) return;
    const tiledImage = this.viewer.world?.getItemAt(0);
    if (!tiledImage || !this.viewer.viewport) return;
    const viewportPoint = this.viewer.viewport.pointFromPixel(event.position, true);
    const imagePoint = tiledImage.viewportToImageCoordinates(viewportPoint);
    const size = tiledImage.getContentSize?.();
    const radius =
      this.pointRadius ??
      (size && size.x > 0 && size.y > 0
        ? Math.max(8, Math.min(size.x, size.y) * 0.008)
        : 12);
    const annotation = createPointImageAnnotation(newId(), imagePoint.x, imagePoint.y, radius);
    this.annotator.state.store.addAnnotation(annotation, ORIGIN_LOCAL as never);
    this.annotator.setSelected(annotation.id);
  };

  /**
   * Observes user-initiated (LOCAL origin) store changes only; shapes pushed via
   * `setAnnotations` arrive as REMOTE and are ignored, preventing sync echo loops.
   */
  onLocalChange(listener: (changes: LocalStoreChanges) => void): () => void {
    const wrapped = (event: { changes: LocalStoreChanges }) => listener(event.changes);
    this.localObservers.add(wrapped);
    this.annotator.state.store.observe(wrapped as never, { origin: ORIGIN_LOCAL as never });
    return () => {
      this.localObservers.delete(wrapped);
      if (!this.destroyed) {
        this.annotator.state.store.unobserve(wrapped as never);
      }
    };
  }

  on<K extends EventName>(event: K, listener: AnnotoriousEditorEvents[K]): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener as (...args: any[]) => void);
    this.listeners.set(event, listeners);
    return () => this.off(event, listener);
  }

  off<K extends EventName>(event: K, listener: AnnotoriousEditorEvents[K]): void {
    this.listeners.get(event)?.delete(listener as (...args: any[]) => void);
  }

  getAnnotations(): ImageAnnotation[] {
    return this.annotator.getAnnotations();
  }

  getAnnotation(id: string): ImageAnnotation | undefined {
    return this.annotator.getAnnotationById(id);
  }

  /** A shape's axis-aligned bounds in image pixels. */
  getBounds(id: string): { x: number; y: number; w: number; h: number } | undefined {
    const b = this.annotator.state.store.getAnnotation(id)?.target.selector.geometry.bounds;
    return b ? { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY } : undefined;
  }

  setAnnotations(annotations: Partial<ImageAnnotation>[], replace = true): void {
    this.annotator.setAnnotations(annotations, replace);
  }

  addAnnotation(annotation: Partial<ImageAnnotation>): void {
    this.annotator.addAnnotation(annotation);
  }

  updateAnnotation(annotation: Partial<ImageAnnotation>): ImageAnnotation {
    return this.annotator.updateAnnotation(annotation);
  }

  removeAnnotation(annotation: string | Partial<ImageAnnotation>): ImageAnnotation | undefined {
    return this.annotator.removeAnnotation(annotation);
  }

  clearAnnotations(): void {
    this.annotator.clearAnnotations();
  }

  getSelected(): ImageAnnotation[] {
    return this.annotator.getSelected();
  }

  select(ids?: string | string[], editable = true): void {
    this.annotator.setSelected(ids, editable);
  }

  getTool(): AnnotationTool {
    return this.tool;
  }

  setTool(tool: AnnotationTool): void {
    const changed = tool !== this.tool;
    this.tool = tool;
    if (changed) this.emit('tool', tool);

    if (tool === 'select' || tool === 'point') {
      this.annotator.setDrawingEnabled(false);
    } else if (
      this.extendedTools &&
      (tool === 'intelligent-scissors' || tool === 'magnetic-cursor') &&
      !this.annotator.listDrawingTools().includes(tool)
    ) {
      this.annotator.setDrawingEnabled(false);
      this.magneticReady ??= import('@annotorious/plugin-magnetic-outline').then(({ mountPlugin }) => {
        if (this.destroyed) return;
        mountPlugin(this.annotator);
      });
      void this.magneticReady.then(() => {
        if (!this.destroyed && this.tool === tool) {
          this.annotator.setDrawingTool(tool as never);
          this.annotator.setDrawingEnabled(true);
        }
      });
    } else {
      this.annotator.setDrawingTool(tool as never);
      this.annotator.setDrawingEnabled(true);
    }
  }

  setDrawingMode(mode: DrawingMode): void {
    this.annotator.setDrawingMode(mode);
  }

  setStyle(style?: DrawingStyleExpression<ImageAnnotation>): void {
    this.annotator.setStyle(style);
  }

  setUser(user: User): void {
    this.annotator.setUser(user);
  }

  setVisible(visible: boolean): void {
    this.annotator.setVisible(visible);
  }

  fitTo(id: string, padding = 40): void {
    this.annotator.fitBoundsWithConstraints(id, { padding });
  }

  canUndo(): boolean { return this.annotator.canUndo(); }
  canRedo(): boolean { return this.annotator.canRedo(); }
  undo(): void { this.annotator.undo(); }
  redo(): void { this.annotator.redo(); }
  cancelDrawing(): void { this.annotator.cancelDrawing(); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.viewer.element?.removeEventListener('pointerdown', this.onPointerDown, true);
    this.viewer.removeHandler?.('canvas-click', this.onCanvasClick as never);
    for (const observer of this.localObservers) {
      this.annotator.state.store.unobserve(observer as never);
    }
    this.localObservers.clear();
    for (const [event, listener] of this.annotoriousListeners) {
      this.annotator.off(event as never, listener as never);
    }
    this.annotoriousListeners = [];
    this.listeners.clear();
    this.annotator.destroy();
  }
}
