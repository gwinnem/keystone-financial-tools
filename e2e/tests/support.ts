import { expect, type Page } from '@playwright/test';

/** The part of `window.playground` (apps/playground/src/main.ts) the tests use. */
interface PlaygroundApi {
  host: { timeToX(time: number): number; priceToY(price: number, yAxisId: string): number };
  tools: { getState(): { activeTool: string | null; selection: readonly string[]; canUndo: boolean; canRedo: boolean } };
  store: { list(): readonly { id: string; kind: string; anchors: readonly { time: number; price: number; yAxisId: string }[] }[] };
  bars: readonly { time: number; open: number; high: number; low: number; close: number }[];
}

declare global {
  interface Window {
    playground?: PlaygroundApi;
  }
}

export interface Pixel {
  readonly x: number;
  readonly y: number;
}

export type StoredDrawing = ReturnType<PlaygroundApi['store']['list']>[number];

/** Opens the playground and waits until the chart is ready. */
export async function openPlayground(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.playground !== undefined);
}

/** The page position of the close of bar `index`, plus `dx` and `dy` px. */
export async function barPoint(page: Page, index: number, dx = 0, dy = 0): Promise<Pixel> {
  const local = await page.evaluate((i) => {
    const playground = window.playground as PlaygroundApi;
    const bar = playground.bars[i];
    return { x: playground.host.timeToX(bar.time), y: playground.host.priceToY(bar.close, 'price') };
  }, index);
  const box = await page.locator('#chart').boundingBox();
  if (box === null) throw new Error('The chart is not visible.');
  // The chart has a 1 px border; the canvases start inside it.
  return { x: box.x + 1 + local.x + dx, y: box.y + 1 + local.y + dy };
}

/** A page position at height `dy` below the top of the chart and `x` from the left of the page: empty space, away from the drawings the tests place. */
export async function emptyPoint(page: Page, x: number, dy = 10): Promise<Pixel> {
  const box = await page.locator('#chart').boundingBox();
  if (box === null) throw new Error('The chart is not visible.');
  return { x, y: box.y + 1 + dy };
}

export async function drawings(page: Page): Promise<StoredDrawing[]> {
  return page.evaluate(() => [...(window.playground as PlaygroundApi).store.list()] as StoredDrawing[]);
}

export async function selection(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (window.playground as PlaygroundApi).tools.getState().selection);
}

/** Chooses a tool on the toolbar and places a drawing with one click per anchor. */
export async function placeTrendLine(page: Page, from: Pixel, to: Pixel): Promise<void> {
  await page.getByRole('button', { name: 'Trend line' }).click();
  await page.mouse.click(from.x, from.y);
  await page.mouse.click(to.x, to.y);
  await expect.poll(async () => (await drawings(page)).length).toBe(1);
}

/** Presses the primary button at `from`, moves to `to` in steps and releases it. */
export async function drag(page: Page, from: Pixel, to: Pixel): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}
