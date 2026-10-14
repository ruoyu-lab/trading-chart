import { fail } from '../utils/errors';
import { deepFreeze, deepMerge, type DeepPartial } from '../utils/merge';
import {
  checkBoolean,
  checkFunctionOrNull,
  checkNumber,
  checkOneOf,
  checkString
} from '../utils/validate';
import type { ChartOptions, Theme } from './types';

export type ChartOptionsInput = DeepPartial<ChartOptions>;

const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
const PRICE_SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'] as const;
const THEME_COLORS: readonly (keyof Omit<Theme, 'palette'>)[] = [
  'background',
  'text',
  'textMuted',
  'grid',
  'border',
  'crosshair',
  'crosshairLabelBackground',
  'crosshairLabelText',
  'up',
  'down',
  'volumeUp',
  'volumeDown',
  'accent',
  'buy',
  'sell',
  'alert'
];

function checkLocale(locale: string | undefined): void {
  if (locale === undefined) {
    return;
  }

  try {
    new Intl.NumberFormat(locale);
  } catch {
    fail(`options.locale ${JSON.stringify(locale)} is not a valid BCP 47 language tag.`);
  }
}

function checkTimeZone(timeZone: string | undefined): void {
  if (timeZone === undefined) {
    return;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    fail(`options.timeZone ${JSON.stringify(timeZone)} is not a valid IANA time zone.`);
  }
}

function validateTheme(theme: Theme): void {
  THEME_COLORS.forEach((key) => {
    checkString(`options.theme.${key}`, theme[key]);
  });

  if (!Array.isArray(theme.palette) || theme.palette.length === 0) {
    fail('options.theme.palette must contain at least one color.');
  }

  theme.palette.forEach((color, index) => {
    checkString(`options.theme.palette[${index}]`, color);
  });
}

function validateOptions(options: ChartOptions): void {
  checkBoolean('options.autoSize', options.autoSize);
  checkLocale(options.locale);
  checkTimeZone(options.timeZone);
  validateTheme(options.theme);
  checkString('options.font.family', options.font.family);
  checkNumber('options.font.size', options.font.size, { min: 6, max: 48 });

  checkBoolean('options.grid.vertical', options.grid.vertical);
  checkBoolean('options.grid.horizontal', options.grid.horizontal);
  checkOneOf('options.grid.style', options.grid.style, LINE_STYLES);

  checkOneOf('options.crosshair.mode', options.crosshair.mode, ['magnet', 'free']);
  checkBoolean('options.crosshair.vertical', options.crosshair.vertical);
  checkBoolean('options.crosshair.horizontal', options.crosshair.horizontal);
  checkBoolean('options.crosshair.labels', options.crosshair.labels);
  checkOneOf('options.crosshair.style', options.crosshair.style, LINE_STYLES);

  checkString('options.mainSeries.type', options.mainSeries.type);
  checkOneOf('options.mainSeries.source', options.mainSeries.source, PRICE_SOURCES);

  const time = options.timeScale;
  checkBoolean('options.timeScale.visible', time.visible);
  checkNumber('options.timeScale.height', time.height, { min: 0 });
  checkNumber('options.timeScale.minBarSpacing', time.minBarSpacing, { min: 0.1 });
  checkNumber('options.timeScale.maxBarSpacing', time.maxBarSpacing, { min: time.minBarSpacing });
  checkNumber('options.timeScale.barSpacing', time.barSpacing, {
    min: time.minBarSpacing,
    max: time.maxBarSpacing
  });
  checkNumber('options.timeScale.rightOffset', time.rightOffset, { min: 0 });
  checkNumber('options.timeScale.loadMoreThreshold', time.loadMoreThreshold, {
    min: 0,
    integer: true
  });
  checkFunctionOrNull('options.timeScale.formatter', time.formatter);

  const price = options.priceScale;
  checkBoolean('options.priceScale.visible', price.visible);
  checkNumber('options.priceScale.margins.top', price.margins.top, { min: 0, max: 0.45 });
  checkNumber('options.priceScale.margins.bottom', price.margins.bottom, { min: 0, max: 0.45 });

  if (price.precision !== 'auto') {
    checkNumber('options.priceScale.precision', price.precision, {
      min: 0,
      max: 12,
      integer: true
    });
  }

  checkFunctionOrNull('options.priceScale.formatter', price.formatter);
  checkNumber('options.priceScale.minWidth', price.minWidth, { min: 0 });

  checkBoolean('options.latestPrice.line', options.latestPrice.line);
  checkBoolean('options.latestPrice.label', options.latestPrice.label);
  checkBoolean('options.latestPrice.countdown', options.latestPrice.countdown);
  checkOneOf('options.latestPrice.style', options.latestPrice.style, LINE_STYLES);

  checkBoolean('options.legend.visible', options.legend.visible);

  const interaction = options.interaction;
  checkBoolean('options.interaction.pan', interaction.pan);
  checkBoolean('options.interaction.wheelZoom', interaction.wheelZoom);
  checkBoolean('options.interaction.pinchZoom', interaction.pinchZoom);
  checkBoolean('options.interaction.axisScale', interaction.axisScale);
  checkBoolean('options.interaction.kineticScroll', interaction.kineticScroll);
  checkBoolean('options.interaction.keyboard', interaction.keyboard);
  checkNumber('options.interaction.longPressMs', interaction.longPressMs, { min: 0 });

  checkNumber('options.panes.defaultHeight', options.panes.defaultHeight, { min: 1 });
  checkNumber('options.panes.minHeight', options.panes.minHeight, { min: 1 });
  checkNumber('options.panes.separatorHeight', options.panes.separatorHeight, { min: 0 });

  checkBoolean('options.drawings.magnet', options.drawings.magnet);
  checkNumber('options.drawings.hitTolerance', options.drawings.hitTolerance, { min: 1 });
  checkNumber('options.drawings.handleRadius', options.drawings.handleRadius, { min: 1 });

  checkNumber('options.performance.maxPixelRatio', options.performance.maxPixelRatio, { min: 1 });
}

/** Merges `patch` into `base`, validates the result and freezes it. `base` is never mutated. */
export function resolveOptions(
  base: ChartOptions,
  patch: ChartOptionsInput | undefined
): ChartOptions {
  const next = deepMerge<ChartOptions>(base, patch);
  validateOptions(next);
  return deepFreeze(next);
}
