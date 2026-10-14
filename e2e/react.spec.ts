import { expect, test } from '@playwright/test';
import type { Chart } from '@trading-chart-sdk/core';

declare global {
  interface Window {
    chart: Chart | undefined;
  }
}

test('renders the React adapter page and reacts to props and events', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto('/react.html');
  await page.waitForFunction(() => (window.chart?.data.length ?? 0) > 0);

  // StrictMode mounts twice; exactly one chart may remain.
  await expect(page.locator('.react-chart canvas')).toHaveCount(3);
  expect(await page.evaluate(() => window.chart?.panes.list().length)).toBe(2);

  const box = await page.locator('.react-chart').boundingBox();

  if (!box) {
    throw new Error('The chart is not visible.');
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 3);
  await expect(page.locator('.close')).toHaveText(/^C \d+\.\d{2}$/);

  const background = () => page.evaluate(() => window.chart?.options().theme.background);
  const dark = await background();
  await page.getByRole('button', { name: 'Light' }).click();
  await expect.poll(background).not.toBe(dark);

  expect(errors).toEqual([]);
});
