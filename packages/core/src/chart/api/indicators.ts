import { formatValue } from '../../format/value-format';
import type {
  Indicator,
  IndicatorDefinition,
  IndicatorInput,
  IndicatorValue,
  ParamValues
} from '../../indicators/types';
import { indicatorColors, indicatorFormat } from '../../render/frame';
import { fail } from '../../utils/errors';
import { checkOneOf } from '../../utils/validate';
import type { ChartCore } from '../chart-core';

export interface IndicatorsApi {
  /** Adds an indicator and returns its id. */
  add(indicator: IndicatorInput): string;
  update(id: string, patch: Pick<IndicatorInput, 'params' | 'source' | 'visible' | 'colors'>): void;
  remove(id: string): void;
  get(id: string): Indicator | null;
  list(): Indicator[];
  /** Values of every output at bar `index` (default: the latest bar). */
  valuesAt(id: string, index?: number): IndicatorValue[];
  /** Adds a custom indicator type for this chart. */
  register<P extends ParamValues>(type: string, definition: IndicatorDefinition<P>): void;
  /** Names of every available indicator type. */
  types(): string[];
}

function validateDefinition(definition: IndicatorDefinition): void {
  const streaming = 'create' in definition;
  const windowed = 'compute' in definition && 'lookback' in definition;

  if (!streaming && !windowed) {
    fail('An indicator definition needs create(), or lookback() and compute().');
  }

  checkOneOf('definition.pane', definition.pane, ['main', 'new']);

  if (typeof definition.outputs !== 'function') {
    fail('An indicator definition needs an outputs() function.');
  }
}

export function createIndicatorsApi(core: ChartCore): IndicatorsApi {
  return {
    add: (indicator) => core.run(() => core.addIndicator(indicator)),
    update: (id, patch) => {
      core.run(() => {
        core.updateIndicator(id, patch);
      });
    },
    remove: (id) => {
      core.run(() => {
        core.removeIndicator(id);
      });
    },
    get: (id) => {
      const entry = core.indicators.get(id);
      return entry ? core.indicators.info(entry) : null;
    },
    list: () => core.indicators.list().map((entry) => core.indicators.info(entry)),
    valuesAt: (id, index = core.bars.length - 1) => {
      const entry = core.indicators.require(id);
      entry.series.sync();
      const frame = core.frame();
      const colors = indicatorColors(entry, core.options.theme.palette);
      const format = indicatorFormat(entry, frame.priceFormat);

      return entry.outputs.map((output, column) => {
        const value =
          index >= 0 && index < core.bars.length ? entry.series.value(column, index) : Number.NaN;
        return {
          key: output.key,
          label: output.label,
          color: colors.get(output.key) ?? core.options.theme.text,
          value: Number.isNaN(value) ? null : value,
          text: formatValue(core.formatter, value, format)
        };
      });
    },
    register: (type, definition) => {
      validateDefinition(definition);
      core.indicators.registry.register(type, definition);
    },
    types: () => core.indicators.registry.names()
  };
}
