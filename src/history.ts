import type { ShapeData } from './types';

/**
 * Geometry command history.
 *
 * Deliberately only geometry. A host composes this with its own metadata
 * history — Mango has to undo a tag edit and a vertex drag in one stroke — so
 * this exposes enough to be driven from outside rather than trying to own the
 * whole undo stack.
 *
 * The unit of history is a committed change, never a pointer sample. A drag
 * that emits a hundred moves is one entry, because that is what a user means
 * by "undo".
 */

export type ChangeKind = 'create' | 'update' | 'delete';

export type ChangeOperation =
  | 'draw'
  | 'move'
  | 'resize'
  | 'vertex'
  | 'rotate'
  | 'programmatic'
  | 'batch';

export interface AnnotationChange<T extends ShapeData = ShapeData> {
  id: string;
  /** Null for a create. */
  before: T | null;
  /** Null for a delete. */
  after: T | null;
  kind: ChangeKind;
  operation: ChangeOperation;
  /**
   * True for an in-flight preview during a gesture.
   *
   * Transient changes never enter history and are safe to ignore. A host that
   * only wants committed state can filter on this one field.
   */
  transient: boolean;
}

/** One undoable step. A gesture that touched several shapes is still one step. */
export interface HistoryEntry {
  changes: AnnotationChange[];
  operation: ChangeOperation;
  /** Selection at the moment the entry was committed, restored on undo. */
  selectionBefore: string | null;
  selectionAfter: string | null;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
}

export interface HistoryOptions {
  /** Maximum entries retained. Older entries fall off the bottom. */
  limit?: number;
  onChange?: (state: HistoryState) => void;
}

/**
 * What `setAnnotations` should do to history.
 *
 * Left implicit, this is a source of real bugs: a host syncing external data
 * into the editor can otherwise leave undo pointing at shapes that no longer
 * exist. Every caller states its intent.
 */
export type HistoryPolicy =
  /** Wipe history. Correct when the underlying document changed. */
  | 'reset'
  /** Leave history alone. Correct for a cosmetic or idempotent sync. */
  | 'preserve'
  /** Record the replacement as one undoable entry. */
  | 'record';

export class CommandHistory {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly limit: number;
  private readonly onChange: ((state: HistoryState) => void) | undefined;

  /** Depth of open transactions. Nested begins coalesce into the outermost. */
  private transactionDepth = 0;
  private pending: AnnotationChange[] = [];
  private pendingOperation: ChangeOperation = 'programmatic';
  private pendingSelectionBefore: string | null = null;
  /** Whether the open transaction saw anything worth recording. */
  private pendingHasCommitted = false;

  constructor(options: HistoryOptions = {}) {
    this.limit = Math.max(1, options.limit ?? 200);
    this.onChange = options.onChange;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  state(): HistoryState {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
    };
  }

  /**
   * Opens a transaction. Every change recorded until `commit` becomes one entry.
   *
   * Used for a pointer gesture, and for a batch mutation from a host.
   */
  begin(operation: ChangeOperation, selection: string | null): void {
    if (this.transactionDepth === 0) {
      this.pending = [];
      this.pendingOperation = operation;
      this.pendingSelectionBefore = selection;
      this.pendingHasCommitted = false;
    }
    this.transactionDepth += 1;
  }

  /**
   * Records a change. Outside a transaction it becomes an entry on its own.
   *
   * Inside a transaction, transient previews *are* folded in — not to be
   * recorded, but so the entry's `before` is the state the gesture started
   * from. Ignoring them entirely would leave `before` equal to the last
   * preview, and undo would restore the shape to where the drag ended.
   */
  record(change: AnnotationChange, selection: string | null): void {
    if (this.transactionDepth > 0) {
      this.coalesce(change);
      if (!change.transient) this.pendingHasCommitted = true;
      return;
    }

    if (change.transient) return;

    this.push({
      changes: [change],
      operation: change.operation,
      selectionBefore: selection,
      selectionAfter: selection,
    });
  }

  /**
   * Folds a change into the pending set.
   *
   * Within one gesture a shape may be updated a hundred times. Only the first
   * `before` and the last `after` matter, so repeated updates to the same id
   * collapse rather than accumulate.
   */
  private coalesce(change: AnnotationChange): void {
    const existing = this.pending.findIndex((entry) => entry.id === change.id);
    if (existing === -1) {
      this.pending.push(change);
      return;
    }

    const previous = this.pending[existing] as AnnotationChange;
    this.pending[existing] = {
      ...change,
      // Earliest before, latest after: that is the whole gesture in one change.
      before: previous.before,
      // A shape created and then edited in one transaction is still a create.
      kind: previous.kind === 'create' && change.kind === 'update' ? 'create' : change.kind,
    };
  }

  /** Closes a transaction, discarding it if nothing changed. */
  commit(selection: string | null): HistoryEntry | null {
    if (this.transactionDepth === 0) return null;
    this.transactionDepth -= 1;
    if (this.transactionDepth > 0) return null;

    const changes = this.pending.filter((change) => change.before !== null || change.after !== null);
    const hadCommitted = this.pendingHasCommitted;
    this.pending = [];
    this.pendingHasCommitted = false;
    // A transaction of previews alone never happened as far as history is
    // concerned; the gesture was abandoned before it committed anything.
    if (changes.length === 0 || !hadCommitted) return null;

    const entry: HistoryEntry = {
      changes,
      operation: this.pendingOperation,
      selectionBefore: this.pendingSelectionBefore,
      selectionAfter: selection,
    };
    this.push(entry);
    return entry;
  }

  /** Abandons an open transaction without recording anything. */
  abort(): void {
    if (this.transactionDepth === 0) return;
    this.transactionDepth -= 1;
    if (this.transactionDepth === 0) {
      this.pending = [];
      this.pendingHasCommitted = false;
    }
  }

  get inTransaction(): boolean {
    return this.transactionDepth > 0;
  }

  private push(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    // Any new action invalidates the redo branch.
    this.redoStack = [];
    this.notify();
  }

  /** Returns the entry to reverse, or null. The caller applies it. */
  undo(): HistoryEntry | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    this.notify();
    return entry;
  }

  /** Returns the entry to reapply, or null. The caller applies it. */
  redo(): HistoryEntry | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    this.notify();
    return entry;
  }

  clear(): void {
    const had = this.undoStack.length > 0 || this.redoStack.length > 0;
    this.undoStack = [];
    this.redoStack = [];
    this.pending = [];
    this.transactionDepth = 0;
    if (had) this.notify();
  }

  private notify(): void {
    this.onChange?.(this.state());
  }
}

/** Inverts an entry, for applying an undo. */
export const invertEntry = (entry: HistoryEntry): AnnotationChange[] =>
  entry.changes
    .map((change) => ({
      ...change,
      before: change.after,
      after: change.before,
      kind: invertKind(change.kind),
    }))
    // Undo replays in reverse so overlapping edits unwind in order.
    .reverse();

const invertKind = (kind: ChangeKind): ChangeKind => {
  if (kind === 'create') return 'delete';
  if (kind === 'delete') return 'create';
  return 'update';
};
