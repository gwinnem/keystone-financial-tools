import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawings, expectDrawings, openPlayground, selection } from './support';

const BAR_INTERVAL_MS = 3_600_000;

/** Tabs from the top of the page until the chart has focus. */
async function focusChart(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.id === 'chart')) return;
  }
  throw new Error('The chart never received focus.');
}

test('places, nudges, selects and deletes a trend line using only the keyboard', async ({ page }) => {
  await openPlayground(page);

  // Choose the tool with its shortcut, then move the keyboard cursor and place the two anchors with Enter.
  await focusChart(page);
  await page.keyboard.press('Alt+t');
  await expect.poll(() => page.evaluate(() => window.playground?.tools.getState().activeTool)).toBe('trend-line');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Enter');
  await expectDrawings(page, 1);
  const [placed] = await drawings(page);
  expect(placed.kind).toBe('trend-line');
  expect(placed.anchors[1].time).toBeGreaterThan(placed.anchors[0].time);

  // Select every drawing, then nudge by one bar to the right and ten px up.
  await page.keyboard.press('Control+a');
  await expect.poll(async () => (await selection(page)).length).toBe(1);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await drawings(page))[0].anchors[0].time).toBe(placed.anchors[0].time + BAR_INTERVAL_MS);
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await drawings(page))[0].anchors[0].price).toBeGreaterThan(placed.anchors[0].price);

  // Delete it.
  await page.keyboard.press('Delete');
  await expectDrawings(page, 0);
});

for (const path of ['/', '/vue.html', '/react.html', '/angular.html']) {
  test(`the toolbar of ${path} has no serious or critical accessibility findings`, async ({ page }) => {
    await page.goto(path);
    await page.getByRole('toolbar', { name: 'Drawing tools' }).waitFor();
    const results = await new AxeBuilder({ page }).include('[role="toolbar"]').analyze();
    const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toStrictEqual([]);
  });
}
