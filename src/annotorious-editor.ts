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

export type AnnotationTool = 'select' | (string & {});

export interface AnnotoriousEditorEvents {
  create: (annotation: ImageAnnotation) => void;
  update: (annotation: ImageAnnotation, previous: ImageAnnotation) => void;
  delete: (annotation: ImageAnnotation) => void;
  select: (annotations: ImageAnnotation[]) => void;
  tool: (tool: AnnotationTool) => void;
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
}

type EventName = keyof AnnotoriousEditorEvents;

/**
 * Small, framework-neutral facade over Annotorious for OpenSeadragon.
 *
 * The facade deliberately keeps Annotorious' native annotation model. This
 * avoids a lossy second model and makes plugins and W3C format adapters usable
 * without conversion at the package boundary.
 */
export class AnnotoriousEditor {
  readonly annotator: OpenSeadragonAnnotator;
  private tool: AnnotationTool = 'select';
  private destroyed = false;
  private listeners = new Map<EventName, Set<(...args: any[]) => void>>();
  private annotoriousListeners: Array<[string, (...args: any[]) => void]> = [];
  private magneticReady?: Promise<void>;
  private extendedTools: boolean;

  constructor(options: AnnotoriousEditorOptions) {
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

    if (tool === 'select') {
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
    for (const [event, listener] of this.annotoriousListeners) {
      this.annotator.off(event as never, listener as never);
    }
    this.annotoriousListeners = [];
    this.listeners.clear();
    this.annotator.destroy();
  }
}

