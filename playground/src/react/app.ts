import {
  darkTheme,
  lightTheme,
  type Bar,
  type Chart,
  type ChartOptionsInput,
  type CrosshairMoveEvent
} from '@trading-chart-sdk/core';
import { TradingChart } from '@trading-chart-sdk/react';
import { createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { INTERVALS, latestBars, nextTick } from '../mock-data';

const INTERVAL = INTERVALS[0].ms;
const TICK_MS = 1000;

declare global {
  interface Window {
    chart: Chart | undefined;
  }
}

/** A minimal React page: the same SDK as the Vue playground, driven through the React adapter. */
export function App() {
  const [dark, setDark] = useState(true);
  const [bars] = useState(() => latestBars(600, INTERVAL));
  const [hovered, setHovered] = useState<Bar | null>(null);
  const chart = useRef<Chart | null>(null);
  const options = useMemo<ChartOptionsInput>(
    () => ({ theme: dark ? darkTheme : lightTheme, latestPrice: { countdown: true } }),
    [dark]
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const instance = chart.current;
      const last = instance?.data.at(-1);

      if (instance && last) {
        instance.data.update(nextTick(last, INTERVAL));
      }
    }, TICK_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const onReady = (instance: Chart) => {
    instance.indicators.add({ type: 'MA', params: { periods: [5, 10, 20] } });
    instance.indicators.add({ type: 'MACD' });
    window.chart = instance;
  };

  const onCrosshairMove = (event: CrosshairMoveEvent) => {
    setHovered(event.visible ? event.bar : null);
  };

  return h(
    'div',
    { className: dark ? 'react-app dark' : 'react-app' },
    h(
      'header',
      null,
      h('strong', null, 'Trading Chart SDK · React'),
      h('span', { className: 'close' }, hovered ? `C ${hovered.close.toFixed(2)}` : ''),
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            setDark(!dark);
          }
        },
        dark ? 'Light' : 'Dark'
      )
    ),
    h(TradingChart, {
      ref: chart,
      className: 'react-chart',
      data: bars,
      options,
      onReady,
      onCrosshairMove
    })
  );
}
