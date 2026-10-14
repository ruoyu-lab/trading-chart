import { expect, test, type Page } from '@playwright/test';
import type { Chart } from '@trading-chart-sdk/core';

declare global {
  interface Window {
    chart: Chart | undefined;
  }
}

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const collected: string[] = [];
  errors.set(page, collected);
  page.on('pageerror', (error) => collected.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      collected.push(message.text());
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => (window.chart?.data.length ?? 0) > 0);
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

/** Center of the main pane in page coordinates. */
async function plotCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('.chart').boundingBox();
  const layout = await page.evaluate(() => window.chart?.layout());

  if (!box || !layout?.panes[0]) {
    throw new Error('The chart has no layout.');
  }

  const main = layout.panes[0].plot;
  return { x: box.x + main.width / 2, y: box.y + main.y + main.height / 2 };
}

/** Dispatches pointer events the way a touch screen would. */
async function touch(page: Page, type: string, id: number, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ type, id, x, y }) => {
      window.chart?.element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: id,
          pointerType: 'touch',
          isPrimary: id === 1,
          clientX: x,
          clientY: y
        })
      );
    },
    { type, id, x, y }
  );
}

test('renders candles, indicators and objects', async ({ page }) => {
  const colors = await page.evaluate(() => {
    const canvas = window.chart?.screenshot();
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return 0;
    }

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set<number>();

    for (let index = 0; index < pixels.length; index += 4 * 97) {
      seen.add(
        ((pixels[index] ?? 0) << 16) | ((pixels[index + 1] ?? 0) << 8) | (pixels[index + 2] ?? 0)
      );
    }

    return seen.size;
  });

  expect(colors).toBeGreaterThan(20);
  expect(await page.evaluate(() => window.chart?.panes.list().length)).toBe(3);
});

test('pans with the mouse and zooms with the wheel', async ({ page }) => {
  const center = await plotCenter(page);
  const before = await page.evaluate(() => window.chart?.timeScale.getVisibleLogicalRange());
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 120, center.y, { steps: 6 });
  await page.mouse.up();
  const panned = await page.evaluate(() => window.chart?.timeScale.getVisibleLogicalRange());

  expect(panned?.from ?? 0).toBeLessThan(before?.from ?? 0);

  const spacing = await page.evaluate(() => window.chart?.timeScale.getBarSpacing());
  await page.mouse.wheel(0, -400);
  await expect
    .poll(() => page.evaluate(() => window.chart?.timeScale.getBarSpacing()))
    .toBeGreaterThan(spacing ?? 0);
});

test('draws a trend line from the toolbar', async ({ page }) => {
  const center = await plotCenter(page);
  await page.getByTitle('趋势线').click();
  await page.mouse.click(center.x - 100, center.y + 40);
  await page.mouse.click(center.x + 60, center.y - 40);

  await expect.poll(() => page.evaluate(() => window.chart?.drawings.list().length)).toBe(1);
  expect(await page.evaluate(() => window.chart?.drawings.list()[0]?.type)).toBe('trend-line');
  expect(await page.evaluate(() => window.chart?.drawings.activeTool())).toBeNull();
});

test('drags an order line to a new price', async ({ page }) => {
  const box = await page.locator('.chart').boundingBox();
  const position = await page.evaluate(() => {
    const order = window.chart?.orders.get('buy-limit');
    return order
      ? { price: order.price, y: window.chart?.priceScale().priceToY(order.price) }
      : null;
  });

  if (!box || position?.y === undefined || position.y === null) {
    throw new Error('The order line is not visible.');
  }

  const y = box.y + position.y;
  await page.mouse.move(box.x + 200, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, y - 30, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => window.chart?.orders.get('buy-limit')?.price))
    .toBeGreaterThan(position.price);
  await expect(page.locator('.status')).toContainText('order buy-limit');
});

test('touch: a long press shows the crosshair, a quick swipe pans', async ({ page }) => {
  const center = await plotCenter(page);
  await touch(page, 'pointerdown', 1, center.x, center.y);
  await page.waitForTimeout(450);

  expect(await page.evaluate(() => window.chart?.crosshair.get() !== null)).toBe(true);

  await touch(page, 'pointerup', 1, center.x, center.y);
  expect(await page.evaluate(() => window.chart?.crosshair.get())).toBeNull();

  const before = await page.evaluate(() => window.chart?.timeScale.getVisibleLogicalRange());
  await touch(page, 'pointerdown', 1, center.x, center.y);
  await touch(page, 'pointermove', 1, center.x + 20, center.y);
  await touch(page, 'pointermove', 1, center.x + 60, center.y);
  await page.waitForTimeout(450);
  await touch(page, 'pointermove', 1, center.x + 90, center.y);
  await touch(page, 'pointerup', 1, center.x + 90, center.y);

  expect(await page.evaluate(() => window.chart?.crosshair.get())).toBeNull();
  const after = await page.evaluate(() => window.chart?.timeScale.getVisibleLogicalRange());
  expect(after?.from ?? 0).toBeLessThan(before?.from ?? 0);
});

test('touch: pinching zooms the time scale', async ({ page }) => {
  const center = await plotCenter(page);
  const spacing = await page.evaluate(() => window.chart?.timeScale.getBarSpacing() ?? 0);
  await touch(page, 'pointerdown', 1, center.x - 40, center.y);
  await touch(page, 'pointerdown', 2, center.x + 40, center.y);
  await touch(page, 'pointermove', 1, center.x - 80, center.y);
  await touch(page, 'pointermove', 2, center.x + 80, center.y);
  await touch(page, 'pointerup', 1, center.x - 80, center.y);
  await touch(page, 'pointerup', 2, center.x + 80, center.y);

  expect(await page.evaluate(() => window.chart?.timeScale.getBarSpacing() ?? 0)).toBeGreaterThan(
    spacing * 1.5
  );
});

test('switches theme, language and chart type', async ({ page }) => {
  await page.getByRole('button', { name: '浅色' }).click();
  await page.getByRole('button', { name: 'EN' }).click();
  await page.locator('select').selectOption('area');

  await expect.poll(() => page.evaluate(() => window.chart?.options().locale)).toBe('en-US');
  expect(await page.evaluate(() => window.chart?.options().mainSeries.type)).toBe('area');
  expect(await page.evaluate(() => window.chart?.options().theme.background)).toBe('#ffffff');
});

/** Whether every canvas bitmap pixel lands on exactly one screen pixel. */
async function canvasesPixelAligned(page: Page): Promise<boolean[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLCanvasElement>('.chart canvas')].map((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return (
        canvas.height > 0 &&
        Math.abs(rect.width * devicePixelRatio - canvas.width) < 0.01 &&
        Math.abs(rect.height * devicePixelRatio - canvas.height) < 0.01
      );
    })
  );
}

for (const deviceScaleFactor of [1, 2]) {
  test.describe(`at device pixel ratio ${deviceScaleFactor}`, () => {
    test.use({ deviceScaleFactor });

    test('stays sharp in a container with a fractional size', async ({ page }) => {
      await page.locator('.chart').evaluate((element) => {
        Object.assign(element.style, {
          width: '700.5px',
          height: '400.5px',
          alignSelf: 'start',
          justifySelf: 'start'
        });
      });

      await expect.poll(() => canvasesPixelAligned(page)).toEqual([true, true, true]);
    });
  });
}
