import { expect, test, type Page } from '@playwright/test';
import { bodyPoint, drawings, expectDrawings, openPlayground, plotPoint, selection, type Pixel } from './support';

// Runs in the `mobile-chromium` project only (touch screen, landscape phone viewport).

test.beforeEach(async ({ page }) => {
  await openPlayground(page);
});

/** Scrolls the whole chart into view (the toolbar scrolls away) and returns the page position of a plot position. */
async function touchPoint(page: Page, x: number, y: number): Promise<Pixel> {
  await page.locator('#chart').scrollIntoViewIfNeeded();
  return plotPoint(page, x, y);
}

async function tapPlot(page: Page, x: number, y: number): Promise<void> {
  const point = await touchPoint(page, x, y);
  await page.touchscreen.tap(point.x, point.y);
}

test('the page has a touch screen', async ({ page }) => {
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
});

test('places a trend line with two taps', async ({ page }) => {
  await page.getByRole('button', { name: 'Trend line' }).tap();
  await tapPlot(page, 150, 60);
  await tapPlot(page, 350, 140);
  await expectDrawings(page, 1);
  const [line] = await drawings(page);
  expect(line.kind).toBe('trend-line');
  expect(line.anchors).toHaveLength(2);
});

test('places a horizontal line with one tap', async ({ page }) => {
  await page.getByRole('button', { name: 'Horizontal line' }).tap();
  await tapPlot(page, 300, 120);
  await expectDrawings(page, 1);
  expect((await drawings(page))[0].kind).toBe('horizontal-line');
});

test('selects a drawing by tapping it and clears the selection by tapping empty space', async ({ page }) => {
  await page.getByRole('button', { name: 'Trend line' }).tap();
  await tapPlot(page, 150, 60);
  await tapPlot(page, 350, 140);
  await expectDrawings(page, 1);
  const [{ id }] = await drawings(page);
  await tapPlot(page, 8, 8);
  expect(await selection(page)).toHaveLength(0);
  await page.locator('#chart').scrollIntoViewIfNeeded();
  const body = await bodyPoint(page, id);
  await page.touchscreen.tap(body.x, body.y);
  expect(await selection(page)).toStrictEqual([id]);
  await tapPlot(page, 8, 8);
  expect(await selection(page)).toHaveLength(0);
});

test('deletes the selected drawing with the Delete button, and undoes it', async ({ page }) => {
  await page.getByRole('button', { name: 'Trend line' }).tap();
  await tapPlot(page, 150, 60);
  await tapPlot(page, 350, 140);
  await expectDrawings(page, 1);
  const [{ id }] = await drawings(page);
  await tapPlot(page, 8, 8);
  await page.locator('#chart').scrollIntoViewIfNeeded();
  const body = await bodyPoint(page, id);
  await page.touchscreen.tap(body.x, body.y);
  await page.getByRole('button', { name: 'Delete' }).tap();
  await expectDrawings(page, 0);
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expectDrawings(page, 1);
});
