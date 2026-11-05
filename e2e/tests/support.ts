import { expect, type Page } from '@playwright/test';

/** The part of `window.playground` (apps/playground/src/main.ts) the tests use. */
interface PlaygroundApi {
  host: {
    timeToX(time: number): number;
    priceToY(price: number, yAxisId: string): number;
    yAxisAt(x: number, y: number): string | null;
    pxPerBar: number;
    offset: number;
    width: number;
    priceHeight: number;
  };
  tools: {
    getState(): { activeTool: string | null; selection: readonly string[]; hover: string | null; canUndo: boolean; canRedo: boolean };
    hitTest(x: number, y: number): { id: string; part: string } | null;
    deactivate(): void;
  };
  store: { list(): readonly { id: string; kind: string; text?: string; anchors: readonly { time: number; price: number; yAxisId: string }[] }[] };
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

/** A tool of the toolbar: the drawing kind, the name of its button and how many anchors it takes (`ANCHOR_COUNT`). */
export interface ToolSpec {
  readonly kind: string;
  readonly label: string;
  readonly anchors: 1 | 2;
}

/** Every tool, in toolbar order. */
export const TOOLS: readonly ToolSpec[] = [
  { kind: 'trend-line', label: 'Trend line', anchors: 2 },
  { kind: 'horizontal-line', label: 'Horizontal line', anchors: 1 },
  { kind: 'rectangle', label: 'Rectangle', anchors: 2 },
  { kind: 'fibonacci-retracement', label: 'Fibonacci retracement', anchors: 2 },
  { kind: 'fibonacci-arcs', label: 'Fibonacci arcs', anchors: 2 },
  { kind: 'fibonacci-fans', label: 'Fibonacci fans', anchors: 2 },
  { kind: 'fibonacci-time-zones', label: 'Fibonacci time zones', anchors: 2 },
  { kind: 'text-note', label: 'Text note', anchors: 1 },
];

/** Opens the playground and waits until the chart is ready. */
export async function openPlayground(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.playground !== undefined);
}

/** Opens the embed page the docs site uses (`apps/playground/embed.html`) with only `tool` enabled, and waits until the chart is ready. */
export async function openEmbed(page: Page, tool: string): Promise<void> {
  await page.goto(`/embed.html?tool=${tool}`);
  await page.waitForFunction(() => window.playground !== undefined);
}

/** How far the chart is zoomed (CSS px per bar) and scrolled (the bar slot at the left edge). */
export async function viewport(page: Page): Promise<{ pxPerBar: number; offset: number }> {
  return page.evaluate(() => {
    const { host } = window.playground as PlaygroundApi;
    return { pxPerBar: host.pxPerBar, offset: host.offset };
  });
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

/** The page position of a plot position: `x` and `y` CSS px from the top left of the plot. The price pane is the top 300 px. */
export async function plotPoint(page: Page, x: number, y: number): Promise<Pixel> {
  const box = await page.locator('#chart').boundingBox();
  if (box === null) throw new Error('The chart is not visible.');
  return { x: box.x + 1 + x, y: box.y + 1 + y };
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

/** Waits until the store holds `count` drawings. */
export async function expectDrawings(page: Page, count: number): Promise<void> {
  await expect.poll(async () => (await drawings(page)).length).toBe(count);
}

/** Chooses a tool on the toolbar and places a drawing with one click per anchor. */
export async function placeTrendLine(page: Page, from: Pixel, to: Pixel): Promise<void> {
  await page.getByRole('button', { name: 'Trend line' }).click();
  await page.mouse.click(from.x, from.y);
  await page.mouse.click(to.x, to.y);
  await expect.poll(async () => (await drawings(page)).length).toBe(1);
}

/** Stops placing, in case a tool is still active (a note is placed in the editor, which may leave its tool on). */
async function stopPlacing(page: Page): Promise<void> {
  await page.evaluate(() => window.playground?.tools.deactivate());
}

/** Confirms the editor of a new note with `text`. */
export async function typeNote(page: Page, text: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'Note text' });
  await expect(editor).toBeVisible();
  await editor.fill(text);
  await editor.press('Control+Enter');
  await expect(editor).toHaveCount(0);
}

/**
 * Places a drawing of `tool` with one click per anchor (`points` has one position per anchor) and waits for it.
 * A text note then gets `text` in its editor. Returns the id of the new drawing.
 */
export async function place(page: Page, tool: ToolSpec, points: readonly Pixel[], text = 'Note'): Promise<string> {
  const before = (await drawings(page)).length;
  await page.getByRole('button', { name: tool.label }).click();
  for (const point of points) await page.mouse.click(point.x, point.y);
  if (tool.kind === 'text-note') await typeNote(page, text);
  await expectDrawings(page, before + 1);
  await stopPlacing(page);
  const all = await drawings(page);
  return all[all.length - 1].id;
}

/** Places a two-anchor drawing by pressing at `from`, dragging and releasing at `to`. */
export async function placeByDrag(page: Page, tool: ToolSpec, from: Pixel, to: Pixel): Promise<string> {
  const before = (await drawings(page)).length;
  await page.getByRole('button', { name: tool.label }).click();
  await drag(page, from, to);
  await expectDrawings(page, before + 1);
  await stopPlacing(page);
  const all = await drawings(page);
  return all[all.length - 1].id;
}

/** Presses the primary button at `from`, moves to `to` in steps and releases it. */
export async function drag(page: Page, from: Pixel, to: Pixel): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * A page position on the body of drawing `id` (not on a handle), found by asking the tools' own hit-test across the price pane.
 * The candidates are the hits with the most hit neighbours (so well inside the 6 px tolerance, not on the edge of a thin shape,
 * which a sub-pixel difference could miss), the one closest to the middle of everything that hits first. Each candidate is checked
 * by moving the real mouse there: the tools' hover must be the drawing, so the point is known to be where a click lands on it.
 */
export async function bodyPoint(page: Page, id: string): Promise<Pixel> {
  const candidates = await page.evaluate((target) => {
    const { tools, host } = window.playground as PlaygroundApi;
    const STEP = 3;
    const hits = new Map<string, { x: number; y: number }>();
    for (let y = 0; y < host.priceHeight; y += STEP) {
      for (let x = 0; x < host.width; x += STEP) {
        const hit = tools.hitTest(x, y);
        if (hit !== null && hit.id === target && !hit.part.startsWith('handle:')) hits.set(`${x},${y}`, { x, y });
      }
    }
    const all = [...hits.values()];
    if (all.length === 0) return [];
    const mean = { x: all.reduce((sum, hit) => sum + hit.x, 0) / all.length, y: all.reduce((sum, hit) => sum + hit.y, 0) / all.length };
    const neighbours = (hit: { x: number; y: number }): number => {
      let count = 0;
      for (const dy of [-STEP, 0, STEP]) for (const dx of [-STEP, 0, STEP]) if ((dx !== 0 || dy !== 0) && hits.has(`${hit.x + dx},${hit.y + dy}`)) count++;
      return count;
    };
    const scored = all.map((hit) => ({ hit, count: neighbours(hit), distance: Math.hypot(hit.x - mean.x, hit.y - mean.y) }));
    scored.sort((a, b) => b.count - a.count || a.distance - b.distance);
    return scored.slice(0, 25).map((entry) => entry.hit);
  }, id);
  if (candidates.length === 0) throw new Error(`Nothing of drawing ${id} is under the pointer.`);
  for (const candidate of candidates) {
    const point = await plotPoint(page, candidate.x, candidate.y);
    await page.mouse.move(point.x, point.y);
    if ((await page.evaluate(() => window.playground?.tools.getState().hover)) === id) return point;
  }
  throw new Error(`The pointer never hovers drawing ${id} at its ${candidates.length} best hit-test points, the first at plot (${candidates[0].x}, ${candidates[0].y}).`);
}

/** A page position on handle `index` of the selected drawing `id`: the middle of the points where the hit-test reports that handle. */
export async function handlePoint(page: Page, id: string, index: number): Promise<Pixel> {
  const local = await page.evaluate(
    ({ target, part }) => {
      const { tools, host } = window.playground as PlaygroundApi;
      const hits: { x: number; y: number }[] = [];
      for (let y = 0; y < host.priceHeight; y += 1) {
        for (let x = 0; x < host.width; x += 1) {
          const hit = tools.hitTest(x, y);
          if (hit !== null && hit.id === target && hit.part === part) hits.push({ x, y });
        }
      }
      if (hits.length === 0) return null;
      return { x: hits.reduce((sum, hit) => sum + hit.x, 0) / hits.length, y: hits.reduce((sum, hit) => sum + hit.y, 0) / hits.length };
    },
    { target: id, part: `handle:${index}` }
  );
  if (local === null) throw new Error(`Drawing ${id} has no handle ${index} under the pointer: is it selected?`);
  return plotPoint(page, local.x, local.y);
}
