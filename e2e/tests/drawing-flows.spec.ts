import { expect, test } from '@playwright/test';
import { barPoint, drag, drawings, emptyPoint, openPlayground, placeTrendLine, selection } from './support';

test.beforeEach(async ({ page }) => {
  await openPlayground(page);
});

test('the toolbar has a button for every tool, undo, redo, delete and magnet', async ({ page }) => {
  const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' });
  for (const name of [
    'Trend line',
    'Horizontal line',
    'Rectangle',
    'Fibonacci retracement',
    'Fibonacci arcs',
    'Fibonacci fans',
    'Fibonacci time zones',
    'Text note',
    'Undo',
    'Redo',
    'Delete',
    'Magnet',
  ]) {
    await expect(toolbar.getByRole('button', { name })).toBeVisible();
  }
});

test('places a trend line with two clicks', async ({ page }) => {
  const from = await barPoint(page, 20);
  const to = await barPoint(page, 40);
  await placeTrendLine(page, from, to);
  const [line] = await drawings(page);
  expect(line.kind).toBe('trend-line');
  expect(line.anchors).toHaveLength(2);
  await expect(page.getByRole('status')).toContainText('1 drawing');
});

test('selects a drawing by clicking it, and clears the selection by clicking empty space', async ({ page }) => {
  const from = await barPoint(page, 20);
  const to = await barPoint(page, 40);
  await placeTrendLine(page, from, to);
  const empty = await emptyPoint(page, from.x);
  await page.mouse.click(empty.x, empty.y);
  expect(await selection(page)).toHaveLength(0);
  await page.mouse.click((from.x + to.x) / 2, (from.y + to.y) / 2);
  expect(await selection(page)).toHaveLength(1);
  await page.mouse.click(empty.x, empty.y);
  expect(await selection(page)).toHaveLength(0);
});

test('moves a selected drawing by dragging its body', async ({ page }) => {
  const from = await barPoint(page, 20);
  const to = await barPoint(page, 40);
  await placeTrendLine(page, from, to);
  const [before] = await drawings(page);
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  await page.mouse.click(middle.x, middle.y);
  await drag(page, middle, { x: middle.x + 40, y: middle.y + 30 });
  const [after] = await drawings(page);
  expect(after.anchors[0].time).toBeGreaterThan(before.anchors[0].time);
  expect(after.anchors[1].time).toBeGreaterThan(before.anchors[1].time);
  expect(after.anchors[0].price).toBeLessThan(before.anchors[0].price);
});

test('resizes a drawing by dragging a handle, leaving the other anchor where it is', async ({ page }) => {
  const from = await barPoint(page, 20);
  const to = await barPoint(page, 40);
  await placeTrendLine(page, from, to);
  const [before] = await drawings(page);
  // Select it first: a selected drawing shows its handles.
  await page.mouse.click((from.x + to.x) / 2, (from.y + to.y) / 2);
  await drag(page, to, { x: to.x + 50, y: to.y - 40 });
  const [after] = await drawings(page);
  expect(after.anchors[0]).toStrictEqual(before.anchors[0]);
  expect(after.anchors[1].time).toBeGreaterThan(before.anchors[1].time);
  expect(after.anchors[1].price).toBeGreaterThan(before.anchors[1].price);
});

test('deletes the selected drawing with the Delete key', async ({ page }) => {
  const from = await barPoint(page, 20);
  const to = await barPoint(page, 40);
  await placeTrendLine(page, from, to);
  await page.mouse.click((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await drawings(page)).length).toBe(0);
});

test('deletes the selected drawing with the Delete button', async ({ page }) => {
  const from = await barPoint(page, 20);
  const to = await barPoint(page, 40);
  await placeTrendLine(page, from, to);
  await page.mouse.click((from.x + to.x) / 2, (from.y + to.y) / 2);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(async () => (await drawings(page)).length).toBe(0);
});

test('undoes and redoes with the toolbar', async ({ page }) => {
  const undo = page.getByRole('button', { name: 'Undo' });
  const redo = page.getByRole('button', { name: 'Redo' });
  await expect(undo).toBeDisabled();
  await placeTrendLine(page, await barPoint(page, 20), await barPoint(page, 40));
  await expect(undo).toBeEnabled();
  await undo.click();
  expect(await drawings(page)).toHaveLength(0);
  await expect(redo).toBeEnabled();
  await redo.click();
  expect(await drawings(page)).toHaveLength(1);
});

test('snaps the anchors to the bars with the magnet on', async ({ page }) => {
  const magnet = page.getByRole('button', { name: 'Magnet' });
  await magnet.click();
  await expect(magnet).toHaveAttribute('aria-pressed', 'true');
  // A few px beside the close of bars 30 and 50: the magnet moves each anchor onto its bar.
  await placeTrendLine(page, await barPoint(page, 30, 2, 3), await barPoint(page, 50, -2, -3));
  const [line] = await drawings(page);
  const bars = await page.evaluate(() => window.playground?.bars ?? []);
  for (const [anchor, index] of [
    [line.anchors[0], 30],
    [line.anchors[1], 50],
  ] as const) {
    const bar = bars[index];
    expect(anchor.time).toBeCloseTo(bar.time, 0);
    expect([bar.open, bar.high, bar.low, bar.close]).toContain(anchor.price);
  }
});

test('keeps the drawings after a reload', async ({ page }) => {
  await placeTrendLine(page, await barPoint(page, 20), await barPoint(page, 40));
  const [saved] = await drawings(page);
  // The page saves shortly after the change: wait until the document is in localStorage.
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).length)).toBeGreaterThan(0);
  await page.reload();
  await page.waitForFunction(() => window.playground !== undefined);
  expect(await drawings(page)).toStrictEqual([saved]);
});
