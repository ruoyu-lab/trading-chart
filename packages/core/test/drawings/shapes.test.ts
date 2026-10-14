import { describe, expect, it } from 'vitest';
import { createDrawingRegistry } from '../../src/drawings/built-in';
import { distanceToSegment, type Segment } from '../../src/drawings/geometry';
import type { DrawingGeometry } from '../../src/drawings/types';
import type { Point } from '../../src/interaction/types';
import { darkTheme } from '../../src/options/themes';
import { withAlpha } from '../../src/canvas/color';

const registry = createDrawingRegistry();
const TOLERANCE = 4;
/** Width of every character measured by the fake context. */
const CHAR_WIDTH = 7;

interface Call {
  readonly method: string;
  readonly args: readonly unknown[];
  /** The context state when the call was made. */
  readonly state: Readonly<Record<string, unknown>>;
}

const RECORDED = [
  'beginPath',
  'moveTo',
  'lineTo',
  'closePath',
  'stroke',
  'fill',
  'fillRect',
  'strokeRect',
  'roundRect',
  'fillText'
];
const SETTABLE = [
  'fillStyle',
  'strokeStyle',
  'lineWidth',
  'lineCap',
  'lineJoin',
  'font',
  'textAlign',
  'textBaseline'
];

/** A 2D context that records calls; using anything it does not implement throws. */
function recordingContext(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { lineDash: [] };
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    ...Object.fromEntries(
      RECORDED.map((method) => [
        method,
        (...args: unknown[]) => {
          calls.push({ method, args, state: { ...state } });
        }
      ])
    ),
    setLineDash: (segments) => {
      state.lineDash = segments;
    },
    measureText: (text) => ({ width: String(text).length * CHAR_WIDTH })
  };
  const ctx = new Proxy(
    {},
    {
      get: (_, key) => {
        if (typeof key === 'string' && key in methods) {
          return methods[key];
        }

        if (typeof key === 'string' && key in state) {
          return state[key];
        }

        throw new Error(`The fake context does not implement ${String(key)}.`);
      },
      set: (_, key, value) => {
        if (typeof key !== 'string' || !SETTABLE.includes(key)) {
          throw new Error(`The fake context does not implement setting ${String(key)}.`);
        }

        state[key] = value;
        return true;
      }
    }
  );
  // The proxy stands in for the part of the 2D context that drawings use.
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}

/** Geometry with anchors given as `[x, price]`; values map to y unchanged. */
function geometryOf(
  type: string,
  anchors: readonly (readonly [number, number])[],
  text = ''
): DrawingGeometry {
  return {
    points: anchors.map(([x, price]) => ({ x, y: price })),
    anchors: anchors.map(([x, price]) => ({ time: x, price })),
    width: 400,
    height: 300,
    style: {
      color: darkTheme.accent,
      lineWidth: 1,
      lineStyle: 'solid',
      fillColor: darkTheme.grid,
      textColor: darkTheme.text,
      fontSize: 12,
      ...registry.require(type).defaultStyle?.(darkTheme)
    },
    text,
    theme: darkTheme,
    fontFamily: 'sans-serif',
    valueToY: (value) => value,
    formatValue: (value) => value.toFixed(2),
    measureText: (text) => text.length * CHAR_WIDTH
  };
}

function paint(
  type: string,
  geometry: DrawingGeometry,
  { hovered = false, selected = false } = {}
): Call[] {
  const { ctx, calls } = recordingContext();
  registry.require(type).paint({ ctx, pixelRatio: 1, geometry, hovered, selected });
  return calls;
}

function hit(type: string, geometry: DrawingGeometry, x: number, y: number) {
  return registry.require(type).hitTest(geometry, { x, y }, TOLERANCE);
}

function pointOf(args: readonly unknown[]): Point {
  return { x: Number(args[0]), y: Number(args[1]) };
}

interface PaintedPath {
  readonly segments: readonly Segment[];
  readonly state: Readonly<Record<string, unknown>>;
}

/** The paths stroked (or filled) by `calls`, as straight segments. */
function pathsOf(calls: readonly Call[], paintMethod: 'stroke' | 'fill'): PaintedPath[] {
  const paths: PaintedPath[] = [];
  let segments: Segment[] = [];
  let start: Point | undefined;
  let current: Point | undefined;

  for (const { method, args, state } of calls) {
    if (method === 'beginPath') {
      segments = [];
    } else if (method === 'moveTo') {
      start = pointOf(args);
      current = start;
    } else if (method === 'lineTo' || method === 'closePath') {
      const next = method === 'lineTo' ? pointOf(args) : start;

      if (!current || !next) {
        throw new Error(`${method} without a current point.`);
      }

      segments.push([current, next]);
      current = next;
    } else if (method === paintMethod) {
      paths.push({ segments, state });
    }
  }

  return paths;
}

function isDashed(path: PaintedPath): boolean {
  return Array.isArray(path.state.lineDash) && path.state.lineDash.length > 0;
}

function textsOf(calls: readonly Call[]): unknown[] {
  return calls.filter(({ method }) => method === 'fillText').map(({ args }) => args[0]);
}

const segment = (x1: number, y1: number, x2: number, y2: number): Segment => [
  { x: x1, y: y1 },
  { x: x2, y: y2 }
];

describe('built-in shape drawings', () => {
  it.each([
    ['rectangle', 2],
    ['parallel-channel', 3],
    ['fib-retracement', 2],
    ['text', 1],
    ['path', 0],
    ['price-range', 2]
  ])('registers %s with %i anchors', (type, points) => {
    expect(registry.require(type).points).toBe(points);
  });
});

describe('rectangle', () => {
  const geometry = geometryOf('rectangle', [
    [100, 100],
    [200, 50]
  ]);

  it('fills and strokes the box between opposite corners', () => {
    const calls = paint('rectangle', geometry);
    const edges = [
      segment(100, 100, 200, 100),
      segment(200, 100, 200, 50),
      segment(200, 50, 100, 50),
      segment(100, 50, 100, 100)
    ];
    const [fill] = pathsOf(calls, 'fill');
    const strokes = pathsOf(calls, 'stroke');

    expect(fill?.state.fillStyle).toBe(withAlpha(darkTheme.accent, 0.12));
    expect(fill?.segments).toEqual(edges);
    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.segments).toEqual(edges);
    expect(strokes[0]?.state.strokeStyle).toBe(darkTheme.accent);
    expect(strokes[0]?.state.lineWidth).toBe(1);
  });

  it('thickens the border while hovered', () => {
    const [stroke] = pathsOf(paint('rectangle', geometry, { hovered: true }), 'stroke');
    expect(stroke?.state.lineWidth).toBe(2);
  });

  it('hits the border as line and the inside as body', () => {
    expect(hit('rectangle', geometry, 150, 102)).toEqual({ part: 'line', distance: 2 });
    expect(hit('rectangle', geometry, 197, 75)).toEqual({ part: 'line', distance: 3 });
    expect(hit('rectangle', geometry, 150, 75)).toEqual({ part: 'body', distance: 0 });
    expect(hit('rectangle', geometry, 150, 110)).toBeNull();
    expect(hit('rectangle', geometry, 300, 300)).toBeNull();
  });
});

describe('parallel-channel', () => {
  const geometry = geometryOf('parallel-channel', [
    [0, 100],
    [100, 50],
    [50, 125]
  ]);

  it('draws the base line and a parallel through the third anchor', () => {
    const strokes = pathsOf(paint('parallel-channel', geometry), 'stroke');
    const solid = strokes.filter((path) => !isDashed(path));

    expect(solid).toHaveLength(1);
    expect(solid[0]?.segments).toEqual([segment(0, 100, 100, 50), segment(0, 150, 100, 100)]);

    const parallel = solid[0]?.segments[1];
    expect(parallel && distanceToSegment({ x: 50, y: 125 }, ...parallel)).toBe(0);
  });

  it('draws a dashed middle line and fills between the lines', () => {
    const calls = paint('parallel-channel', geometry);
    const dashed = pathsOf(calls, 'stroke').filter(isDashed);
    const [fill] = pathsOf(calls, 'fill');

    expect(dashed).toHaveLength(1);
    expect(dashed[0]?.segments).toEqual([segment(0, 125, 100, 75)]);
    expect(fill?.state.fillStyle).toBe(withAlpha(darkTheme.accent, 0.12));
    expect(fill?.segments.map(([start]) => start)).toEqual([
      { x: 0, y: 100 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 150 }
    ]);
  });

  it('shifts a vertical base line sideways', () => {
    const vertical = geometryOf('parallel-channel', [
      [50, 0],
      [50, 100],
      [80, 40]
    ]);
    const [stroke] = pathsOf(paint('parallel-channel', vertical), 'stroke');
    expect(stroke?.segments).toEqual([segment(50, 0, 50, 100), segment(80, 0, 80, 100)]);
  });

  it('hits both lines as line and the inside as body', () => {
    expect(hit('parallel-channel', geometry, 50, 77)?.part).toBe('line');
    expect(hit('parallel-channel', geometry, 50, 127)?.part).toBe('line');
    expect(hit('parallel-channel', geometry, 50, 110)).toEqual({ part: 'body', distance: 0 });
    expect(hit('parallel-channel', geometry, 50, 200)).toBeNull();
    expect(hit('parallel-channel', geometry, 150, 100)).toBeNull();
  });
});

describe('fib-retracement', () => {
  const geometry = geometryOf('fib-retracement', [
    [10, 100],
    [90, 200]
  ]);
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  it('draws seven level lines between the anchors and a dashed diagonal', () => {
    const strokes = pathsOf(paint('fib-retracement', geometry), 'stroke');
    const [lines] = strokes.filter((path) => !isDashed(path));
    const dashed = strokes.filter(isDashed);

    expect(lines?.segments.map(([start]) => start.y)).toEqual(
      levels.map((level) => 100 + (200 - 100) * level)
    );
    expect(
      lines?.segments.every(([start, end]) => start.x === 10 && end.x === 90 && start.y === end.y)
    ).toBe(true);
    expect(dashed).toHaveLength(1);
    expect(dashed[0]?.segments).toEqual([segment(10, 100, 90, 200)]);
  });

  it('labels each level with its ratio and price at the left', () => {
    const calls = paint('fib-retracement', geometry);

    expect(textsOf(calls)).toEqual([
      '0 (100.00)',
      '0.236 (123.60)',
      '0.382 (138.20)',
      '0.5 (150.00)',
      '0.618 (161.80)',
      '0.786 (178.60)',
      '1 (200.00)'
    ]);
    expect(
      calls.filter(({ method }) => method === 'fillText').every(({ args }) => args[1] === 14)
    ).toBe(true);
  });

  it('fills every other band between consecutive levels', () => {
    const bands = paint('fib-retracement', geometry).filter(({ method }) => method === 'fillRect');

    expect(bands).toHaveLength(3);
    expect(bands.every(({ state }) => state.fillStyle === withAlpha(darkTheme.accent, 0.08))).toBe(
      true
    );
  });

  it('spans the x range of the anchors in either order', () => {
    const reversed = geometryOf('fib-retracement', [
      [90, 100],
      [10, 200]
    ]);
    const [lines] = pathsOf(paint('fib-retracement', reversed), 'stroke');
    expect(lines?.segments[0]).toEqual(segment(10, 100, 90, 100));
  });

  it('hits the level lines only', () => {
    expect(hit('fib-retracement', geometry, 50, 152)).toEqual({ part: 'line', distance: 2 });
    expect(hit('fib-retracement', geometry, 50, 130)).toBeNull();
    expect(hit('fib-retracement', geometry, 120, 150)).toBeNull();
  });
});

describe('text', () => {
  const geometry = geometryOf('text', [[50, 60]], 'Hello');

  it('draws the text left-aligned at the anchor', () => {
    const calls = paint('text', geometry);
    const draw = calls.find(({ method }) => method === 'fillText');

    expect(draw?.args).toEqual(['Hello', 50, 60]);
    expect(draw?.state).toMatchObject({
      fillStyle: darkTheme.text,
      textAlign: 'left',
      textBaseline: 'middle',
      font: 'normal 12px sans-serif'
    });
    expect(calls.some(({ method }) => method === 'strokeRect')).toBe(false);
  });

  it('draws a placeholder for empty text', () => {
    expect(textsOf(paint('text', geometryOf('text', [[50, 60]])))).toEqual(['Text']);
  });

  it('outlines the text box while selected', () => {
    const border = paint('text', geometry, { selected: true }).find(
      ({ method }) => method === 'strokeRect'
    );
    expect(border?.args).toEqual([46, 50, 5 * CHAR_WIDTH + 8, 20]);
  });

  it('hits the text box as body', () => {
    expect(hit('text', geometry, 70, 60)).toEqual({ part: 'body', distance: 0 });
    expect(hit('text', geometry, 92, 72)).toEqual({ part: 'body', distance: 0 });
    expect(hit('text', geometry, 100, 60)).toBeNull();
    expect(hit('text', geometry, 70, 80)).toBeNull();
  });
});

describe('path', () => {
  const geometry = geometryOf('path', [
    [0, 0],
    [50, 50],
    [100, 0]
  ]);

  it('strokes a polyline through every anchor', () => {
    const strokes = pathsOf(paint('path', geometry), 'stroke');
    expect(strokes).toHaveLength(1);
    expect(strokes[0]?.segments).toEqual([segment(0, 0, 50, 50), segment(50, 50, 100, 0)]);
  });

  it('paints a two-anchor preview while placing', () => {
    const preview = geometryOf('path', [
      [0, 0],
      [50, 50]
    ]);
    const [stroke] = pathsOf(paint('path', preview), 'stroke');
    expect(stroke?.segments).toEqual([segment(0, 0, 50, 50)]);
  });

  it('hits any segment as line', () => {
    expect(hit('path', geometry, 75, 27)?.part).toBe('line');
    expect(hit('path', geometry, 25, 27)?.part).toBe('line');
    expect(hit('path', geometry, 50, 0)).toBeNull();
  });
});

describe('price-range', () => {
  const rising = geometryOf('price-range', [
    [100, 100],
    [200, 110]
  ]);

  it('shows the change and percent change of a rise in the up color', () => {
    const calls = paint('price-range', rising);
    const [fill] = pathsOf(calls, 'fill');
    const [stroke] = pathsOf(calls, 'stroke');

    expect(textsOf(calls)).toEqual(['+10.00 (+10.00%)']);
    expect(fill?.state.fillStyle).toBe(withAlpha(darkTheme.up, 0.15));
    expect(stroke?.state.strokeStyle).toBe(darkTheme.up);
    expect(stroke?.segments).toHaveLength(4);
  });

  it('shows a fall in the down color', () => {
    const falling = geometryOf('price-range', [
      [100, 100],
      [200, 90]
    ]);
    const calls = paint('price-range', falling);

    expect(textsOf(calls)).toEqual(['-10.00 (-10.00%)']);
    expect(pathsOf(calls, 'stroke')[0]?.state.strokeStyle).toBe(darkTheme.down);
  });

  it('omits the percent change from a zero price', () => {
    const fromZero = geometryOf('price-range', [
      [100, 0],
      [200, 5]
    ]);
    expect(textsOf(paint('price-range', fromZero))).toEqual(['+5.00']);
  });

  it('hits the border as line and the inside as body', () => {
    expect(hit('price-range', rising, 150, 101)).toEqual({ part: 'line', distance: 1 });
    expect(hit('price-range', rising, 150, 105)).toEqual({ part: 'body', distance: 0 });
    expect(hit('price-range', rising, 150, 130)).toBeNull();
  });
});
