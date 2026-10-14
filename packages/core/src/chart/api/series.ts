import type { Series, SeriesInput, SeriesPointInput } from '../../series/series-store';
import type { SeriesTypeDefinition } from '../../series/types';
import { fail } from '../../utils/errors';
import { checkOneOf } from '../../utils/validate';
import type { ChartCore } from '../chart-core';

/** Additional series aligned to the main bars by time, such as comparison symbols. */
export interface SeriesApi {
  /** Adds a series and returns its id. */
  add(series: SeriesInput): string;
  update(id: string, patch: Pick<SeriesInput, 'title' | 'visible' | 'style'>): void;
  remove(id: string): void;
  get(id: string): Series | null;
  list(): Series[];
  setData(id: string, points: readonly SeriesPointInput[]): void;
  /** Replaces the last point or appends newer points. */
  updateData(id: string, point: SeriesPointInput | readonly SeriesPointInput[]): void;
  prependData(id: string, points: readonly SeriesPointInput[]): void;
  /** Adds a custom series type for this chart. */
  registerType<Style extends object>(type: string, definition: SeriesTypeDefinition<Style>): void;
  /** Names of every available series type. */
  types(): string[];
}

function validateDefinition(definition: SeriesTypeDefinition<object>): void {
  checkOneOf('definition.input', definition.input, ['ohlc', 'value']);

  if (typeof definition.defaultStyle !== 'function' || typeof definition.paint !== 'function') {
    fail('A series type definition needs defaultStyle() and paint() functions.');
  }
}

export function createSeriesApi(core: ChartCore): SeriesApi {
  const write = (
    id: string,
    mode: 'set' | 'update' | 'prepend',
    points: readonly SeriesPointInput[]
  ) => {
    core.run(() => {
      core.series.write(core.series.require(id), mode, points);

      // Replacing or extending a series' history is not a live move of its value.
      if (mode !== 'update') {
        core.alerts.rebaseline();
      }

      core.invalidate();
    });
  };

  return {
    add: (series) => core.run(() => core.addSeries(series)),
    update: (id, patch) => {
      core.run(() => {
        core.series.update(id, patch);
        core.invalidate();
      });
    },
    remove: (id) => {
      core.run(() => {
        core.removeSeries(id);
      });
    },
    get: (id) => {
      const entry = core.series.get(id);
      return entry ? core.series.info(entry) : null;
    },
    list: () => core.series.list().map((entry) => core.series.info(entry)),
    setData: (id, points) => {
      write(id, 'set', points);
    },
    updateData: (id, point) => {
      write(id, 'update', Array.isArray(point) ? point : [point as SeriesPointInput]);
    },
    prependData: (id, points) => {
      write(id, 'prepend', points);
    },
    registerType: (type, definition) => {
      validateDefinition(definition);
      core.seriesTypes.register(type, definition);
    },
    types: () => core.seriesTypes.names()
  };
}
