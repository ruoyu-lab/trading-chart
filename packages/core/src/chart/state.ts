import type { PriceSource } from '../data/types';
import { DrawingStore } from '../drawings/drawing-store';
import type { Drawing } from '../drawings/types';
import { IndicatorStore } from '../indicators/indicator-store';
import type { ParamValues } from '../indicators/types';
import type { PriceScaleMode } from '../options/types';
import { MAIN_PANE_ID, PaneStore } from '../panes/pane-store';
import type { PriceRange } from '../scales/price-scale';
import type { SeriesType } from '../series/styles';
import { describeValue, fail } from '../utils/errors';
import { checkNumber, checkObject } from '../utils/validate';
import type { ChartCore } from './chart-core';

/**
 * The user-editable layout of a chart: main series type, view, panes, indicators and drawings.
 * Market data, series, orders, markers and alerts belong to the application and are not included.
 */
export interface ChartState {
  readonly version: 1;
  readonly mainSeries: { readonly type: SeriesType; readonly source: PriceSource };
  readonly view: { readonly barSpacing: number; readonly offset: number };
  readonly panes: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly height: number;
    readonly auto: boolean;
    readonly mode: PriceScaleMode;
    readonly inverted: boolean;
    /** Manual range in scale space, or `null` while auto-scaling. */
    readonly range: PriceRange | null;
  }>;
  readonly indicators: ReadonlyArray<{
    readonly id: string;
    readonly type: string;
    readonly params: ParamValues;
    readonly pane: string;
    readonly source: PriceSource;
    readonly visible: boolean;
    readonly colors: Readonly<Record<string, string>>;
  }>;
  readonly drawings: readonly Drawing[];
}

export function saveState(core: ChartCore): ChartState {
  return structuredClone({
    version: 1,
    mainSeries: { type: core.options.mainSeries.type, source: core.options.mainSeries.source },
    view: core.timeScale.state(),
    panes: core.panes.list().map((entry) => ({
      id: entry.id,
      title: entry.title,
      height: entry.height,
      auto: entry.auto,
      mode: entry.mode,
      inverted: entry.invert,
      range: entry.scale.manualRange()
    })),
    indicators: core.indicators.list().map((entry) => {
      const info = core.indicators.info(entry);
      return {
        id: info.id,
        type: info.type,
        params: info.params,
        pane: info.pane,
        source: info.source,
        visible: info.visible,
        colors: info.colors
      };
    }),
    drawings: core.drawings.store.list().map((entry) => core.drawings.store.info(entry))
  } satisfies ChartState);
}

/** Validates the whole state first, then applies it in one step; on error nothing changes. */
export function loadState(core: ChartCore, state: ChartState): void {
  checkObject('state', state);

  if ((state.version as unknown) !== 1) {
    fail(`Unsupported chart state: expected version 1, received ${describeValue(state.version)}.`);
  }

  core.seriesTypes.require(state.mainSeries.type);
  const options = core.options;
  const panes = new PaneStore(options.panes.defaultHeight, options.priceScale.margins);

  if (state.panes[0]?.id !== MAIN_PANE_ID) {
    fail('The first pane of a chart state must be the main pane.');
  }

  state.panes.forEach((pane, index) => {
    const entry =
      index === 0
        ? panes.require(MAIN_PANE_ID)
        : panes.add({ id: pane.id, title: pane.title, height: pane.height }, pane.auto);
    panes.update(entry.id, {
      title: pane.title,
      height: checkNumber(`panes[${index}].height`, pane.height, { min: 1 })
    });
    panes.setScaleMode(entry.id, pane.mode);
    panes.setScaleInverted(entry.id, pane.inverted);

    if (pane.range !== null) {
      checkNumber(`panes[${index}].range.min`, pane.range.min);
      checkNumber(`panes[${index}].range.max`, pane.range.max);
    }
  });

  const indicators = new IndicatorStore(core.bars, core.indicators.registry);
  state.indicators.forEach((indicator) => {
    panes.require(indicator.pane);
    indicators.add(
      {
        id: indicator.id,
        type: indicator.type,
        params: indicator.params,
        source: indicator.source,
        visible: indicator.visible,
        colors: { ...indicator.colors }
      },
      indicator.pane
    );
  });

  const drawings = new DrawingStore(core.drawings.store.registry);
  state.drawings.forEach((drawing) => {
    drawings.add(drawings.create(drawing, (id) => panes.get(id) !== undefined));
  });

  for (const series of core.series.list()) {
    if (!panes.get(series.pane)) {
      fail(`The state has no pane "${series.pane}", which series "${series.id}" is drawn in.`);
    }
  }

  for (const alert of core.alerts.list()) {
    for (const source of [alert.source, alert.value]) {
      if (typeof source === 'number' || source.kind !== 'indicator') {
        continue;
      }

      const indicator = indicators.get(source.id);

      if (!indicator?.outputs.some((output) => output.key === source.key)) {
        fail(
          `The state has no output "${source.key}" of indicator "${source.id}", which alert "${alert.id}" reads.`
        );
      }
    }
  }

  checkNumber('view.barSpacing', state.view.barSpacing, { min: 0, exclusiveMin: true });
  checkNumber('view.offset', state.view.offset);

  // Everything is valid: apply.
  core.applyOptions({
    mainSeries: { type: state.mainSeries.type, source: state.mainSeries.source }
  });
  core.panes.adopt(panes);
  state.panes.forEach((pane) => {
    core.panes.require(pane.id).scale.restoreManualRange(pane.range);
  });
  core.indicators.adopt(indicators);
  core.drawings.store.restore(drawings.snapshot());
  core.drawings.history.clear();
  core.drawings.cancelTool();
  core.timeScale.restore(state.view);
  core.alerts.rebaseline();
  core.objects.prune();
  core.invalidate();
}
