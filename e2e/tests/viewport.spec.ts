import { expect, test } from '@playwright/test';
import { barPoint, drawings, openPlayground, placeTrendLine, viewport } from './support';

test.beforeEach(async ({ page }) => {
  await openPlayground(page);
});

test('has a price pane above a volume pane', async ({ page }) => {
  const panes = await page.evaluate(() => {
    const host = window.playground?.host;
    return { price: host?.yAxisAt(400, 100), volume: host?.yAxisAt(400, 350), outside: host?.yAxisAt(400, 500) };
  });
  expect(panes).toStrictEqual({ price: 'price', volume: 'volume', outside: null });
  await expect(page.locator('#chart canvas')).toHaveCount(2);
});

test('zooms with the wheel and scrolls with Shift and the wheel', async ({ page }) => {
  const box = await page.locator('#chart').boundingBox();
  if (box === null) throw new Error('The chart is not visible.');
  await page.mouse.move(box.x + 400, box.y + 150);
  const before = await viewport(page);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await viewport(page)).pxPerBar).toBeGreaterThan(before.pxPerBar);
  const zoomed = await viewport(page);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 200);
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await viewport(page)).offset).toBeGreaterThan(zoomed.offset);
});

test('zooms and scrolls with the keyboard while the chart has focus', async ({ page }) => {
  await page.locator('#chart').focus();
  const before = await viewport(page);
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect.poll(async () => (await viewport(page)).pxPerBar).toBeGreaterThan(before.pxPerBar);
  await page.keyboard.press('End');
  await expect.poll(async () => (await viewport(page)).offset).toBeGreaterThan(0);
  await page.keyboard.press('Home');
  await expect.poll(async () => (await viewport(page)).offset).toBe(0);
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  await expect.poll(async () => (await viewport(page)).pxPerBar).toBeCloseTo(before.pxPerBar, 5);
});

test('keeps a drawing on its bars when the chart is zoomed and scrolled', async ({ page }) => {
  await placeTrendLine(page, await barPoint(page, 20), await barPoint(page, 40));
  const [placed] = await drawings(page);
  const before = await barPoint(page, 20);
  await page.locator('#chart').focus();
  await page.keyboard.press('+');
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  // The bars moved on the screen, but the drawing holds times and prices, not pixels: nothing about it changed.
  expect((await barPoint(page, 20)).x).not.toBe(before.x);
  expect(await drawings(page)).toStrictEqual([placed]);
});
