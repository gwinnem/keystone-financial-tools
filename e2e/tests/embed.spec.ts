import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { drawings, expectDrawings, openEmbed, plotPoint, TOOLS, typeNote, type ToolSpec } from './support';

// The embed page is what the docs site shows on the page of each tool (E09-F01-S03): the chart with only one tool enabled and already active.

const ACTIONS = ['Undo', 'Redo', 'Delete', 'Magnet'];

/** The plot positions (x, y) of the anchors of the n-th drawing (n 0 to 2), spread so that no two drawings overlap and all stay in the price pane (the top 300 px). */
function anchorsOf(tool: ToolSpec, n: number): readonly (readonly [number, number])[] {
  const top = 40 + n * 80;
  return tool.anchors === 1
    ? [[300, top + 40]]
    : [
        [150, top],
        [350, top + 60],
      ];
}

async function click(page: Page, [x, y]: readonly [number, number]): Promise<void> {
  const point = await plotPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
}

/** Tabs from the top of the page until the chart has focus. */
async function focusChart(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.id === 'chart')) return;
  }
  throw new Error('The chart never received focus.');
}

for (const tool of TOOLS) {
  test.describe(`embed page for ${tool.kind}`, () => {
    test.beforeEach(async ({ page }) => {
      await openEmbed(page, tool.kind);
    });

    test('has a button for its tool and for Undo, Redo, Delete and Magnet, and for no other tool', async ({ page }) => {
      const names = await page.getByRole('toolbar').getByRole('button').allTextContents();
      expect(names).toStrictEqual([tool.label, ...ACTIONS]);
    });

    test('has its tool active from the start', async ({ page }) => {
      await expect(page.getByRole('button', { name: tool.label })).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => window.playground?.tools.getState().activeTool)).toBe(tool.kind);
      await expect(page.locator('#status')).toContainText(`Tool: ${tool.kind}`);
    });

    test('places a drawing of its kind with one click for each anchor', async ({ page }) => {
      for (const point of anchorsOf(tool, 0)) await click(page, point);
      if (tool.kind === 'text-note') await typeNote(page, 'Hello');
      await expectDrawings(page, 1);
      const [placed] = await drawings(page);
      expect(placed.kind).toBe(tool.kind);
      expect(placed.anchors).toHaveLength(tool.anchors);
    });

    test('keeps nothing across a reload: the drawings are in memory only', async ({ page }) => {
      for (const point of anchorsOf(tool, 0)) await click(page, point);
      if (tool.kind === 'text-note') await typeNote(page, 'Gone');
      await expectDrawings(page, 1);
      await openEmbed(page, tool.kind);
      await expectDrawings(page, 0);
    });
  });
}

test('keeps the tool active after a drawing is placed, so several can be placed in a row', async ({ page }) => {
  const tool = TOOLS[0];
  await openEmbed(page, tool.kind);
  for (const n of [0, 1, 2]) {
    for (const point of anchorsOf(tool, n)) await click(page, point);
    await expectDrawings(page, n + 1);
  }
  await expect(page.getByRole('button', { name: tool.label })).toHaveAttribute('aria-pressed', 'true');
});

test('undoes and redoes with the buttons', async ({ page }) => {
  const tool = TOOLS[0];
  await openEmbed(page, tool.kind);
  for (const point of anchorsOf(tool, 0)) await click(page, point);
  await expectDrawings(page, 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expectDrawings(page, 0);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expectDrawings(page, 1);
});

test('places a trend line with only the keyboard', async ({ page }) => {
  await openEmbed(page, 'trend-line');
  await focusChart(page);
  // The tool is already active: Enter places the first anchor at the keyboard cursor, then move it and place the second.
  await page.keyboard.press('Enter');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Enter');
  await expectDrawings(page, 1);
  const [placed] = await drawings(page);
  expect(placed.kind).toBe('trend-line');
  expect(placed.anchors[1].time).toBeGreaterThan(placed.anchors[0].time);
});

for (const search of ['', '?tool=', '?tool=circle', '?tool=Trend-Line', '?other=trend-line']) {
  test(`says how to ask for a tool when the address is /embed.html${search}`, async ({ page }) => {
    await page.goto(`/embed.html${search}`);
    await expect(page.locator('#status')).toContainText(
      'Add ?tool= with one of: trend-line, horizontal-line, rectangle, fibonacci-retracement, fibonacci-arcs, fibonacci-fans, fibonacci-time-zones, text-note.'
    );
    await expect(page.getByRole('toolbar')).toBeHidden();
    await expect(page.locator('#chart')).toBeHidden();
    expect(await page.evaluate(() => window.playground)).toBeUndefined();
  });
}

test('the toolbar has no serious or critical accessibility findings', async ({ page }) => {
  await openEmbed(page, 'trend-line');
  await page.getByRole('toolbar', { name: 'Drawing tools' }).waitFor();
  const results = await new AxeBuilder({ page }).include('[role="toolbar"]').analyze();
  const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toStrictEqual([]);
});
