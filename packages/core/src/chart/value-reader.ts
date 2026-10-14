import type { ValueReader } from '../alerts/alerts-domain';
import type { BarStore } from '../data/bar-store';
import type { IndicatorStore } from '../indicators/indicator-store';
import { MAIN_PANE_ID } from '../panes/pane-store';
import type { SeriesStore } from '../series/series-store';
import { fail } from '../utils/errors';

/** Reads prices, indicator outputs and series values for alerts. */
export function createValueReader(
  bars: BarStore,
  indicators: IndicatorStore,
  series: SeriesStore
): ValueReader {
  const outputColumn = (id: string, key: string) =>
    indicators.require(id).outputs.findIndex((output) => output.key === key);

  return {
    check: (source, label) => {
      if (source.kind === 'indicator') {
        const entry =
          indicators.get(source.id) ?? fail(`${label}: unknown indicator "${source.id}".`);

        if (outputColumn(entry.id, source.key) < 0) {
          fail(`${label}: indicator "${source.id}" has no output "${source.key}".`);
        }
      } else if (source.kind === 'series') {
        series.require(source.id);
      }
    },
    read: (source, index) => {
      switch (source.kind) {
        case 'price':
          return bars.price(index, source.field ?? 'close');
        case 'indicator': {
          const entry = indicators.require(source.id);
          entry.series.sync();
          return entry.series.value(outputColumn(source.id, source.key), index);
        }
        case 'series': {
          const entry = series.require(source.id);
          const store = entry.values ?? entry.bars;
          // The series point at or before the bar's time.
          const at = store ? store.lowerBound(bars.time(index) + 1) - 1 : -1;

          if (at < 0) {
            return Number.NaN;
          }

          return entry.values ? entry.values.value(at) : (entry.bars?.close(at) ?? Number.NaN);
        }
      }
    },
    paneOf: (source) =>
      source.kind === 'price'
        ? MAIN_PANE_ID
        : source.kind === 'indicator'
          ? indicators.require(source.id).pane
          : series.require(source.id).pane
  };
}
