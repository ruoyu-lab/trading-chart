import { afterEach } from 'vitest';
import { createChart, type Chart } from '../../src/chart/create-chart';
import type { ChartOptionsInput } from '../../src/options/resolve';
import { createBars } from './bars';

const charts: Chart[] = [];

afterEach(() => {
  charts.splice(0).forEach((chart) => {
    chart.destroy();
  });
  document.body.replaceChildren();
});

/** A chart in an 800 × 500 container, destroyed after the test. */
export function createTestChart(options?: ChartOptionsInput, width = 800, height = 500): Chart {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: height });
  document.body.appendChild(container);
  const chart = createChart(container, options);
  charts.push(chart);
  return chart;
}

export function chartWithBars(count = 200, options?: ChartOptionsInput): Chart {
  const chart = createTestChart(options);
  chart.data.set(createBars(count));
  return chart;
}

type PointerKind = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel';

/** Dispatches a mouse pointer event at chart coordinates. */
export function pointer(
  chart: Chart,
  type: PointerKind,
  x: number,
  y: number,
  init: PointerEventInit = {}
): void {
  chart.element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'mouse',
      button: 0,
      buttons: type === 'pointerup' ? 0 : 1,
      ...init
    })
  );
}

/** Presses, moves in steps and releases the mouse. */
export function drag(chart: Chart, from: [number, number], to: [number, number], steps = 4): void {
  pointer(chart, 'pointerdown', from[0], from[1]);

  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    pointer(
      chart,
      'pointermove',
      from[0] + (to[0] - from[0]) * ratio,
      from[1] + (to[1] - from[1]) * ratio
    );
  }

  pointer(chart, 'pointerup', to[0], to[1]);
}

export function click(chart: Chart, x: number, y: number): void {
  pointer(chart, 'pointerdown', x, y);
  pointer(chart, 'pointerup', x, y);
}

export function key(chart: Chart, keyName: string, init: KeyboardEventInit = {}): void {
  chart.element.dispatchEvent(
    new KeyboardEvent('keydown', { key: keyName, bubbles: true, ...init })
  );
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}
