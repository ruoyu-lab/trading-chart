import { darkTheme } from './themes';
import type { ChartOptions } from './types';

export function createDefaultOptions(): ChartOptions {
  return {
    autoSize: true,
    locale: undefined,
    timeZone: undefined,
    theme: darkTheme,
    font: {
      family:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
      size: 12
    },
    grid: {
      vertical: true,
      horizontal: true,
      style: 'solid'
    },
    crosshair: {
      mode: 'free',
      vertical: true,
      horizontal: true,
      labels: true,
      style: 'dashed'
    },
    mainSeries: {
      type: 'candles',
      source: 'close',
      styles: {}
    },
    timeScale: {
      visible: true,
      height: 28,
      barSpacing: 8,
      minBarSpacing: 0.5,
      maxBarSpacing: 60,
      rightOffset: 60,
      loadMoreThreshold: 20,
      formatter: null
    },
    priceScale: {
      visible: true,
      margins: { top: 0.1, bottom: 0.08 },
      precision: 'auto',
      formatter: null,
      minWidth: 48
    },
    latestPrice: {
      line: true,
      label: true,
      countdown: false,
      style: 'dotted'
    },
    legend: {
      visible: true
    },
    interaction: {
      pan: true,
      wheelZoom: true,
      pinchZoom: true,
      axisScale: true,
      kineticScroll: true,
      keyboard: true,
      longPressMs: 300
    },
    panes: {
      defaultHeight: 120,
      minHeight: 40,
      separatorHeight: 5
    },
    drawings: {
      magnet: false,
      hitTolerance: 6,
      handleRadius: 4.5
    },
    performance: {
      maxPixelRatio: 3
    }
  };
}
