import { fail } from '../utils/errors';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

let normalizer: CanvasRenderingContext2D | null | undefined;

function parseHex(hex: string): Rgba {
  const digits =
    hex.length <= 4
      ? hex
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : hex;
  const value = (offset: number) => Number.parseInt(digits.slice(offset, offset + 2), 16);
  return { r: value(0), g: value(2), b: value(4), a: digits.length === 8 ? value(6) / 255 : 1 };
}

function parseRgb(match: RegExpExecArray): Rgba {
  const alpha = match[4];
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a:
      alpha === undefined
        ? 1
        : alpha.endsWith('%')
          ? Number(alpha.slice(0, -1)) / 100
          : Number(alpha)
  };
}

function parse(color: string): Rgba {
  const trimmed = color.trim();
  const hex = HEX.exec(trimmed);

  if (hex?.[1]) {
    return parseHex(hex[1]);
  }

  const rgb = RGB.exec(trimmed);

  if (rgb) {
    return parseRgb(rgb);
  }

  // Other CSS color syntaxes are normalized by the browser's canvas parser.
  normalizer ??= document.createElement('canvas').getContext('2d');

  if (normalizer) {
    normalizer.fillStyle = '#000000';
    normalizer.fillStyle = trimmed;
    const normalized = normalizer.fillStyle;

    if (normalized !== '#000000' || /^(black|#0{3,8})$/i.test(trimmed)) {
      return parse(normalized);
    }
  }

  return fail(`Unsupported color ${JSON.stringify(color)}.`);
}

/** Returns `color` with its alpha multiplied by `alpha`. */
export function withAlpha(color: string, alpha: number): string {
  const { r, g, b, a } = parse(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * alpha * 1000) / 1000})`;
}
