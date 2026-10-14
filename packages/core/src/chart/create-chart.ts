import { toTime, type TimeInput } from '../data/time';
import type { Unsubscribe } from '../events/event-bus';
import type { ChartOptionsInput } from '../options/resolve';
import type { Layout } from '../layout/layout';
import type { ChartOptions } from '../options/types';
import { MAIN_PANE_ID } from '../panes/pane-store';
import { fail } from '../utils/errors';
import { checkNumber } from '../utils/validate';
import { createDataApi, type DataApi } from './api/data';
import { createDrawingsApi, type DrawingsApi } from './api/drawings';
import { createIndicatorsApi, type IndicatorsApi } from './api/indicators';
import {
  createPanesApi,
  createPriceScaleApi,
  type PanesApi,
  type PriceScaleApi
} from './api/panes';
import { createSeriesApi, type SeriesApi } from './api/series';
import { createTimeScaleApi, type TimeScaleApi } from './api/time-scale';
import {
  createAlertsApi,
  createMarkersApi,
  createOrdersApi,
  type AlertsApi,
  type MarkersApi,
  type OrdersApi
} from './api/trading';
import { ChartCore } from './chart-core';
import type { CrosshairState } from './cursor';
import { assertEnvironment } from './environment';
import { loadState, saveState, type ChartState } from './state';
import type { Selection } from '../objects/types';
import { checkOneOf, checkString } from '../utils/validate';
import type { ChartEventMap } from './events';

export interface CrosshairApi {
  /** Where the crosshair is, or `null` while it is hidden. */
  get(): CrosshairState | null;
  /**
   * Shows the crosshair at a time (and optionally a value of a pane) without a pointer, for
   * example to mirror another chart. Pointer movement takes over again.
   */
  set(position: { time: TimeInput; price?: number; pane?: string }): void;
  clear(): void;
}

export interface Chart {
  /** The element the chart created inside its container. */
  readonly element: HTMLElement;
  /** The resolved options. */
  options(): Readonly<ChartOptions>;
  /** Deep-merges option changes; arrays and functions are replaced. */
  applyOptions(options: ChartOptionsInput): void;
  /** Rectangles of the panes, the price axis and the time axis, for positioning custom overlays. */
  layout(): Layout;
  /** Sets the size in CSS pixels; with `autoSize` the container size wins on its next change. */
  resize(width: number, height: number): void;
  /** Runs several API calls and dispatches their events once afterwards. */
  batch(operation: () => void): void;
  on<K extends keyof ChartEventMap>(
    type: K,
    listener: (event: ChartEventMap[K]) => void
  ): Unsubscribe;
  readonly data: DataApi;
  readonly timeScale: TimeScaleApi;
  /** The price scale of a pane (default: the main pane). */
  priceScale(paneId?: string): PriceScaleApi;
  readonly panes: PanesApi;
  readonly series: SeriesApi;
  readonly indicators: IndicatorsApi;
  readonly crosshair: CrosshairApi;
  readonly drawings: DrawingsApi;
  readonly orders: OrdersApi;
  readonly markers: MarkersApi;
  readonly alerts: AlertsApi;
  /** Selects a drawing, order, alert or marker, or clears the selection with `null`. */
  select(selection: Selection | null): void;
  /** The selected object, or `null`. */
  selection(): Selection | null;
  /** The user-editable layout: main series type, view, panes, indicators and drawings. */
  saveState(): ChartState;
  /** Restores a saved layout atomically; an invalid state throws and changes nothing. */
  loadState(state: ChartState): void;
  /** Renders pending changes and returns a canvas with the whole chart. */
  screenshot(): HTMLCanvasElement;
  /** Removes the chart's element and releases every listener, observer and timer. */
  destroy(): void;
}

/**
 * Creates a chart inside `container`. The chart fills the container and follows its size unless
 * `autoSize` is off.
 *
 * ```ts
 * const chart = createChart(document.getElementById('chart')!, { locale: 'zh-CN' });
 * chart.data.set(bars);
 * chart.indicators.add({ type: 'MACD' });
 * ```
 */
export function createChart(container: HTMLElement, options?: ChartOptionsInput): Chart {
  const view = assertEnvironment(container);
  const core = new ChartCore(view, container, options);
  const priceScales = new Map<string, PriceScaleApi>();

  return {
    element: core.surface.root,
    options: () => core.options,
    applyOptions: (patch) => {
      core.run(() => {
        core.applyOptions(patch);
      });
    },
    layout: () => structuredClone(core.frame().layout),
    resize: (width, height) => {
      checkNumber('width', width, { min: 0 });
      checkNumber('height', height, { min: 0 });
      core.run(() => {
        core.resize(width, height);
      });
    },
    batch: (operation) => {
      core.run(operation);
    },
    on: (type, listener) => core.bus.on(type, listener),
    data: createDataApi(core),
    timeScale: createTimeScaleApi(core),
    priceScale: (paneId = MAIN_PANE_ID) => {
      core.panes.require(paneId);
      let api = priceScales.get(paneId);

      if (!api) {
        api = createPriceScaleApi(core, paneId);
        priceScales.set(paneId, api);
      }

      return api;
    },
    panes: createPanesApi(core),
    series: createSeriesApi(core),
    indicators: createIndicatorsApi(core),
    crosshair: {
      get: () => core.crosshair,
      set: ({ time, price, pane = MAIN_PANE_ID }) => {
        core.run(() => {
          core.panes.require(pane);
          core.setExternalCrosshair({
            time: toTime(time),
            price: price === undefined ? null : checkNumber('price', price),
            paneId: pane
          });
        });
      },
      clear: () => {
        core.run(() => {
          core.setExternalCrosshair(null);
        });
      }
    },
    drawings: createDrawingsApi(core),
    orders: createOrdersApi(core),
    markers: createMarkersApi(core),
    alerts: createAlertsApi(core),
    select: (selection) => {
      core.run(() => {
        if (selection !== null) {
          checkOneOf('selection.kind', selection.kind, ['drawing', 'order', 'alert', 'marker']);
          checkString('selection.id', selection.id);

          if (!core.objects.exists(selection)) {
            fail(`There is no ${selection.kind} with id "${selection.id}".`);
          }
        }

        core.select(selection);
      });
    },
    selection: () => core.objects.selection,
    saveState: () => saveState(core),
    loadState: (state) => {
      core.run(() => {
        loadState(core, state);
      });
    },
    screenshot: () =>
      core.run(() => {
        core.flush();
        return core.surface.composite();
      }),
    destroy: () => {
      core.destroy();
    }
  };
}
