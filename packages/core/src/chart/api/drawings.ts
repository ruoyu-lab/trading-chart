import { DrawingStore } from '../../drawings/drawing-store';
import type { ToolOptions } from '../../drawings/drawings-domain';
import type { Drawing, DrawingInput, DrawingTypeDefinition } from '../../drawings/types';
import { fail } from '../../utils/errors';
import { checkNumber } from '../../utils/validate';
import type { ChartCore } from '../chart-core';

export interface DrawingsApi {
  /** Replaces every drawing (e.g. when loading a saved layout) and clears the undo history. */
  set(drawings: readonly DrawingInput[]): void;
  /** Adds a drawing as an undoable step and returns its id. */
  add(drawing: DrawingInput): string;
  update(id: string, patch: Omit<Partial<DrawingInput>, 'id' | 'type'>): void;
  remove(id: string): void;
  clear(): void;
  get(id: string): Drawing | null;
  list(): Drawing[];
  /**
   * Lets the user place a drawing of `type`. The tool ends when the drawing is complete
   * (`drawingsChange` with reason `create`, then `toolChange`), on Escape, or with `cancelTool()`.
   */
  startTool(type: string, options?: ToolOptions): void;
  cancelTool(): void;
  /** Type of the active tool, or `null`. */
  activeTool(): string | null;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Adds a custom drawing type for this chart. */
  registerType(type: string, definition: DrawingTypeDefinition): void;
  types(): string[];
}

function validateDefinition(definition: DrawingTypeDefinition): void {
  checkNumber('definition.points', definition.points, { min: 0, max: 20, integer: true });

  if (typeof definition.paint !== 'function' || typeof definition.hitTest !== 'function') {
    fail('A drawing type definition needs paint() and hitTest() functions.');
  }
}

export function createDrawingsApi(core: ChartCore): DrawingsApi {
  const domain = core.drawings;
  const store = domain.store;
  const paneExists = (id: string) => core.panes.get(id) !== undefined;
  const mutate = (operation: () => void) => {
    core.run(() => {
      domain.mutate(operation);
      core.objects.prune();
      core.invalidateLayers('objects');
    });
  };

  return {
    set: (drawings) => {
      core.run(() => {
        const staging = new DrawingStore(store.registry);
        drawings.forEach((drawing) => {
          staging.add(staging.create(drawing, paneExists));
        });
        store.restore(staging.snapshot());
        domain.history.clear();
        core.objects.prune();
        core.invalidateLayers('objects');
      });
    },
    add: (drawing) =>
      core.run(() => {
        const entry = store.create(drawing, paneExists);
        mutate(() => {
          store.add(entry);
        });
        return entry.id;
      }),
    update: (id, patch) => {
      core.run(() => {
        store.require(id);
        mutate(() => {
          store.update(id, patch, paneExists);
        });
      });
    },
    remove: (id) => {
      core.run(() => {
        store.require(id);
        mutate(() => {
          store.remove(id);
        });
      });
    },
    clear: () => {
      mutate(() => {
        store.restore([]);
      });
    },
    get: (id) => {
      const entry = store.get(id);
      return entry ? store.info(entry) : null;
    },
    list: () => store.list().map((entry) => store.info(entry)),
    startTool: (type, options = {}) => {
      core.run(() => {
        domain.startTool(type, options);
      });
    },
    cancelTool: () => {
      core.run(() => {
        domain.cancelTool();
      });
    },
    activeTool: () => domain.activeToolType(),
    undo: () =>
      core.run(() => {
        const done = domain.restore('undo');
        core.objects.prune();
        return done;
      }),
    redo: () =>
      core.run(() => {
        const done = domain.restore('redo');
        core.objects.prune();
        return done;
      }),
    canUndo: () => domain.history.canUndo,
    canRedo: () => domain.history.canRedo,
    registerType: (type, definition) => {
      validateDefinition(definition);
      store.registry.register(type, definition);
    },
    types: () => store.registry.names()
  };
}
