import type { PriceScaleMode } from '../../options/types';
import { MAIN_PANE_ID, type Pane, type PaneInput } from '../../panes/pane-store';
import type { PriceRange } from '../../scales/price-scale';
import { fail } from '../../utils/errors';
import { checkNumber } from '../../utils/validate';
import type { ChartCore } from '../chart-core';

/** The price scale of one pane. Coordinates are relative to the chart's top-left corner. */
export interface PriceScaleApi {
  /** Visible value range, or `null` when nothing is drawn in the pane. */
  getRange(): PriceRange | null;
  /** Fixes the range and turns auto-scaling off. */
  setRange(range: PriceRange): void;
  /** Turns auto-scaling back on. */
  autoScale(): void;
  isAutoScale(): boolean;
  /** The configured mode; percent/indexed/log fall back to normal while their base is unusable. */
  getMode(): PriceScaleMode;
  setMode(mode: PriceScaleMode): void;
  isInverted(): boolean;
  setInverted(inverted: boolean): void;
  priceToY(price: number): number | null;
  yToPrice(y: number): number | null;
}

export interface PanesApi {
  /** Panes from top to bottom; the main pane comes first. */
  list(): Pane[];
  get(id: string): Pane | null;
  add(pane: PaneInput): void;
  update(id: string, patch: Omit<PaneInput, 'id'>): void;
  /** Removes a pane and its drawings. Remove its indicators and series first. */
  remove(id: string): void;
  /** Moves a pane to position `index` (the main pane stays at 0). */
  move(id: string, index: number): void;
}

export function createPriceScaleApi(core: ChartCore, paneId: string): PriceScaleApi {
  const entry = () => core.panes.require(paneId);
  const plotTop = () => {
    const pane = core.frame().panes.find((item) => item.id === paneId);
    return pane?.plot.y ?? fail(`Unknown pane "${paneId}".`);
  };
  const mutate = (operation: () => void) => {
    core.run(() => {
      core.frame();
      operation();
      core.invalidate();
    });
  };

  return {
    getRange: () => {
      core.frame();
      return entry().scale.valueRange();
    },
    setRange: (range) => {
      checkNumber('range.min', range.min);
      checkNumber('range.max', range.max);

      if (!(range.max > range.min)) {
        fail(`range.max (${range.max}) must be greater than range.min (${range.min}).`);
      }

      mutate(() => {
        if (!entry().scale.setValueRange(range)) {
          fail(
            `The range ${range.min}..${range.max} cannot be shown in ${entry().scale.mode} mode.`
          );
        }
      });
    },
    autoScale: () => {
      mutate(() => {
        entry().scale.resetAutoScale();
      });
    },
    isAutoScale: () => entry().scale.autoScale,
    getMode: () => entry().mode,
    setMode: (mode) => {
      mutate(() => {
        core.panes.setScaleMode(paneId, mode);
      });
    },
    isInverted: () => entry().invert,
    setInverted: (inverted) => {
      mutate(() => {
        core.panes.setScaleInverted(paneId, inverted);
      });
    },
    priceToY: (price) => {
      const top = plotTop();
      const y = entry().scale.valueToY(price);
      return Number.isFinite(y) ? top + y : null;
    },
    yToPrice: (y) => {
      const top = plotTop();
      const price = entry().scale.yToValue(y - top);
      return Number.isFinite(price) ? price : null;
    }
  };
}

export function createPanesApi(core: ChartCore): PanesApi {
  return {
    list: () => core.panes.list().map((entry) => core.panes.info(entry)),
    get: (id) => {
      const entry = core.panes.get(id);
      return entry ? core.panes.info(entry) : null;
    },
    add: (pane) => {
      core.run(() => {
        core.panes.add(pane, false);
        core.invalidate();
      });
    },
    update: (id, patch) => {
      core.run(() => {
        core.panes.update(id, patch);
        core.invalidate();
      });
    },
    remove: (id) => {
      core.run(() => {
        if (id === MAIN_PANE_ID) {
          fail('The main pane cannot be removed.');
        }

        const occupants = core.paneOccupants(id);

        if (occupants.length > 0) {
          fail(`Pane "${id}" still contains ${occupants.map((item) => `"${item}"`).join(', ')}.`);
        }

        core.removePane(id);
        core.invalidate();
      });
    },
    move: (id, index) => {
      core.run(() => {
        core.panes.move(id, index);
        core.invalidate();
      });
    }
  };
}
