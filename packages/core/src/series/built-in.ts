import { Registry } from '../utils/registry';
import { candlesSeries, highLowSeries, hollowCandlesSeries, ohlcSeries } from './bars';
import {
  areaSeries,
  baselineSeries,
  columnsSeries,
  hlcAreaSeries,
  lineMarkersSeries,
  lineSeries,
  stepLineSeries
} from './lines';
import type { SeriesTypeDefinition } from './types';

export type AnySeriesDefinition = SeriesTypeDefinition<object>;

export function createSeriesRegistry(): Registry<AnySeriesDefinition> {
  const builtIns: Record<string, AnySeriesDefinition> = {
    candles: candlesSeries,
    'hollow-candles': hollowCandlesSeries,
    ohlc: ohlcSeries,
    'high-low': highLowSeries,
    line: lineSeries,
    'step-line': stepLineSeries,
    'line-markers': lineMarkersSeries,
    area: areaSeries,
    baseline: baselineSeries,
    'hlc-area': hlcAreaSeries,
    columns: columnsSeries
  };
  return new Registry('series type', builtIns);
}
