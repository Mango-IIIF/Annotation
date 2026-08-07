import {
  CommandHistory,
  invertEntry,
  type AnnotationChange,
  type ChangeOperation,
  type HistoryPolicy,
  type HistoryState,
} from './history';
import type { ShapeData } from './types';

/**
 * The editor's annotation collection.
 *
 * Split out from the editor so that mutation, selection, history, and
 * interaction policy are testable without a DOM or a viewport, and so a host
 * can update one annotation without the editor rebuilding every shape.
 */

/**
 * What a host permits for a given shape.
 *
 * Neutral on purpose: this package has no idea what a permission is. A host
 * decides, per shape, and the editor only enforces.
 */
export interface InteractionPolicy {
  /** Can be clicked and focused. Default true. */
  selectable?: boolean;
  /** Geometry can be changed. Default true. */
  editable?: boolean;
  /** Can be removed through the editor. Default true. */
  deletable?: boolean;
  /** Can be rotated, when rotation is enabled. Defaults to `editable`. */
  rotatable?: boolean;
  /** Drawn at all. Default true. */
  visible?: boolean;
}

export type InteractionPolicyResolver = (annotation: ShapeData) => InteractionPolicy | undefined;

const DEFAULT_POLICY: Required<InteractionPolicy> = {
  selectable: true,
  editable: true,
  deletable: true,
  rotatable: true,
  visible: true,
};

/** How `setAnnotations` treats the existing collection. */
export type ReplacementMode =
  /** Discard everything and take the supplied list verbatim. */
  | 'replace'
  /** Add and update by id, leaving anything not mentioned in place. */
  | 'merge';

export interface SetAnnotationsOptions {
  mode?: ReplacementMode;
  history?: HistoryPolicy;
}

export interface MutationOptions {
  operation?: ChangeOperation;
  /** A preview during a gesture: emitted to the host, never recorded. */
  transient?: boolean;
}

export interface StoreOptions {
  annotations?: readonly ShapeData[];
  selectedId?: string | null;
  historyLimit?: number;
  policy?: InteractionPolicyResolver;
  onChange?: (changes: readonly AnnotationChange[]) => void;
  onSelectionChanged?: (id: string | null) => void;
  onHistoryChanged?: (state: HistoryState) => void;
}

export class DuplicateAnnotationError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`An annotation with id "${id}" already exists.`);
    this.name = 'DuplicateAnnotationError';
    this.id = id;
  }
}

export class AnnotationStore {
  private items: ShapeData[] = [];
  private index = new Map<string, number>();
  private selected: string | null = null;
  private readonly history: CommandHistory;
  private readonly policy: InteractionPolicyResolver | undefined;
  private readonly onChange: ((changes: readonly AnnotationChange[]) => void) | undefined;
  private readonly onSelectionChanged: ((id: string | null) => void) | undefined;

  constructor(options: StoreOptions = {}) {
    this.policy = options.policy;
    this.onChange = options.onChange;
    this.onSelectionChanged = options.onSelectionChanged;
    this.history = new CommandHistory({
      ...(options.historyLimit === undefined ? {} : { limit: options.historyLimit }),
      ...(options.onHistoryChanged ? { onChange: options.onHistoryChanged } : {}),
    });

    this.items = [...(options.annotations ?? [])];
    this.reindex();
    this.selected = options.selectedId && this.index.has(options.selectedId)
      ? options.selectedId
      : null;
  }

  /* ---------------------------------------------------------------- */
  /* Reads                                                             */
  /* ---------------------------------------------------------------- */

  all(): ShapeData[] {
    return [...this.items];
  }

  /** Only the shapes a host has not hidden. */
  visible(): ShapeData[] {
    return this.items.filter((item) => this.policyFor(item).visible);
  }

  /**
   * Visits the visible shapes without building an array.
   *
   * `visible()` allocates a filtered copy, which is fine once but not on every
   * animation frame with a large collection.
   */
  forEachVisible(visit: (annotation: ShapeData) => void): void {
    for (const item of this.items) {
      if (this.policyFor(item).visible) visit(item);
    }
  }

  get(id: string): ShapeData | undefined {
    const position = this.index.get(id);
    return position === undefined ? undefined : this.items[position];
  }

  has(id: string): boolean {
    return this.index.has(id);
  }

  get size(): number {
    return this.items.length;
  }

  get selectedId(): string | null {
    return this.selected;
  }

  policyFor(annotation: ShapeData): Required<InteractionPolicy> {
    const supplied = this.policy?.(annotation) ?? {};
    const editable = supplied.editable ?? DEFAULT_POLICY.editable;
    return {
      selectable: supplied.selectable ?? DEFAULT_POLICY.selectable,
      editable,
      deletable: supplied.deletable ?? DEFAULT_POLICY.deletable,
      // A read-only shape is not rotatable unless the host says otherwise.
      rotatable: supplied.rotatable ?? editable,
      visible: supplied.visible ?? DEFAULT_POLICY.visible,
    };
  }

  canEdit(id: string): boolean {
    const annotation = this.get(id);
    return annotation ? this.policyFor(annotation).editable : false;
  }

  canDelete(id: string): boolean {
    const annotation = this.get(id);
    return annotation ? this.policyFor(annotation).deletable : false;
  }

  canRotate(id: string): boolean {
    const annotation = this.get(id);
    return annotation ? this.policyFor(annotation).rotatable : false;
  }

  canSelect(id: string): boolean {
    const annotation = this.get(id);
    return annotation ? this.policyFor(annotation).selectable : false;
  }

  /* ---------------------------------------------------------------- */
  /* Selection                                                         */
  /* ---------------------------------------------------------------- */

  select(id: string | null): boolean {
    const next = id !== null && this.canSelect(id) ? id : null;
    if (this.selected === next) return false;
    this.selected = next;
    this.onSelectionChanged?.(next);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* Mutations                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Adds an annotation.
   *
   * A duplicate id throws rather than silently replacing or appending a second
   * shape with the same identity. Both alternatives lose data in ways that only
   * surface much later.
   */
  add(annotation: ShapeData, options: MutationOptions = {}): ShapeData {
    if (this.index.has(annotation.id)) throw new DuplicateAnnotationError(annotation.id);

    this.items.push(annotation);
    this.index.set(annotation.id, this.items.length - 1);

    this.emit({
      id: annotation.id,
      before: null,
      after: annotation,
      kind: 'create',
      operation: options.operation ?? 'programmatic',
      transient: options.transient ?? false,
    });
    return annotation;
  }

  /** Updates an annotation in place, returning the previous value. */
  update(annotation: ShapeData, options: MutationOptions = {}): ShapeData | undefined {
    const position = this.index.get(annotation.id);
    if (position === undefined) return undefined;

    const before = this.items[position] as ShapeData;
    if (before === annotation) return before;
    this.items[position] = annotation;

    this.emit({
      id: annotation.id,
      before,
      after: annotation,
      kind: 'update',
      operation: options.operation ?? 'programmatic',
      transient: options.transient ?? false,
    });
    return before;
  }

  /**
   * Marks an annotation's current state as committed.
   *
   * Used to close a gesture: the previews already moved the shape, so there is
   * nothing left to mutate — this only records the change that history needs,
   * with a truthful `before`. Mutating back and forth to force an emit would
   * repaint the shape at its old position for a frame.
   */
  commitCurrent(id: string, before: ShapeData, operation: ChangeOperation): boolean {
    const after = this.get(id);
    if (!after) return false;
    this.emit({ id, before, after, kind: 'update', operation, transient: false });
    return true;
  }

  /** Removes an annotation, returning the removed value. */
  remove(id: string, options: MutationOptions = {}): ShapeData | undefined {
    const position = this.index.get(id);
    if (position === undefined) return undefined;

    const before = this.items[position] as ShapeData;
    // Captured before the selection is cleared, or undo would restore the shape
    // without restoring the selection that went with it.
    const selectionBefore = this.selected;
    this.items.splice(position, 1);
    this.reindex();
    if (this.selected === id) this.select(null);

    this.emit(
      {
      id,
      before,
      after: null,
        kind: 'delete',
        operation: options.operation ?? 'programmatic',
        transient: options.transient ?? false,
      },
      selectionBefore,
    );
    return before;
  }

  /**
   * Runs several mutations as one history entry.
   *
   * Returns whatever the callback returns, so a host can batch and still get a
   * result out.
   */
  batch<T>(operation: ChangeOperation, run: () => T): T {
    this.history.begin(operation, this.selected);
    try {
      const result = run();
      this.history.commit(this.selected);
      return result;
    } catch (error) {
      this.history.abort();
      throw error;
    }
  }

  /**
   * Replaces or merges the whole collection.
   *
   * The history policy is required to be thought about rather than defaulted
   * silently — see `HistoryPolicy`. `reset` is the safe choice when the
   * underlying document changed, because preserved history would otherwise
   * point at shapes that no longer exist.
   */
  setAll(annotations: readonly ShapeData[], options: SetAnnotationsOptions = {}): void {
    const mode = options.mode ?? 'replace';
    const historyPolicy = options.history ?? 'reset';

    const previous = new Map(this.items.map((item) => [item.id, item]));
    const changes: AnnotationChange[] = [];

    if (mode === 'replace') {
      const nextIds = new Set(annotations.map((item) => item.id));
      for (const [id, before] of previous) {
        if (!nextIds.has(id)) {
          changes.push({
            id,
            before,
            after: null,
            kind: 'delete',
            operation: 'batch',
            transient: false,
          });
        }
      }
      this.items = [...annotations];
    } else {
      const merged = [...this.items];
      for (const annotation of annotations) {
        const position = this.index.get(annotation.id);
        if (position === undefined) merged.push(annotation);
        else merged[position] = annotation;
      }
      this.items = merged;
    }

    for (const annotation of annotations) {
      const before = previous.get(annotation.id);
      if (!before) {
        changes.push({
          id: annotation.id,
          before: null,
          after: annotation,
          kind: 'create',
          operation: 'batch',
          transient: false,
        });
      } else if (before !== annotation) {
        changes.push({
          id: annotation.id,
          before,
          after: annotation,
          kind: 'update',
          operation: 'batch',
          transient: false,
        });
      }
    }

    this.reindex();
    if (this.selected && !this.index.has(this.selected)) this.select(null);

    if (historyPolicy === 'reset') this.history.clear();
    else if (historyPolicy === 'record' && changes.length > 0) {
      this.history.begin('batch', this.selected);
      for (const change of changes) this.history.record(change, this.selected);
      this.history.commit(this.selected);
    }

    if (changes.length > 0) this.onChange?.(changes);
  }

  /* ---------------------------------------------------------------- */
  /* History                                                           */
  /* ---------------------------------------------------------------- */

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  historyState(): HistoryState {
    return this.history.state();
  }

  clearHistory(): void {
    this.history.clear();
  }

  beginTransaction(operation: ChangeOperation): void {
    this.history.begin(operation, this.selected);
  }

  commitTransaction(): void {
    this.history.commit(this.selected);
  }

  abortTransaction(): void {
    this.history.abort();
  }

  undo(): boolean {
    const entry = this.history.undo();
    if (!entry) return false;
    this.applyChanges(invertEntry(entry));
    this.restoreSelection(entry.selectionBefore);
    return true;
  }

  redo(): boolean {
    const entry = this.history.redo();
    if (!entry) return false;
    this.applyChanges(entry.changes);
    this.restoreSelection(entry.selectionAfter);
    return true;
  }

  /**
   * Applies changes without recording them.
   *
   * Undo and redo must not themselves become history, or the stack never
   * unwinds.
   */
  private applyChanges(changes: readonly AnnotationChange[]): void {
    for (const change of changes) {
      if (change.after === null) {
        const position = this.index.get(change.id);
        if (position !== undefined) {
          this.items.splice(position, 1);
          this.reindex();
        }
        continue;
      }

      const position = this.index.get(change.id);
      if (position === undefined) {
        this.items.push(change.after);
        this.index.set(change.after.id, this.items.length - 1);
      } else {
        this.items[position] = change.after;
      }
    }
    this.reindex();
    this.onChange?.(changes);
  }

  private restoreSelection(id: string | null): void {
    const next = id !== null && this.index.has(id) ? id : null;
    if (this.selected === next) return;
    this.selected = next;
    this.onSelectionChanged?.(next);
  }

  private emit(change: AnnotationChange, selection: string | null = this.selected): void {
    this.history.record(change, selection);
    this.onChange?.([change]);
  }

  private reindex(): void {
    this.index.clear();
    for (let position = 0; position < this.items.length; position += 1) {
      const item = this.items[position];
      if (item) this.index.set(item.id, position);
    }
  }
}
