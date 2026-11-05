import { expect, test, type Page } from '@playwright/test';
import { drawings, expectDrawings, openPlayground, selection, TOOLS, typeNote, type ToolSpec } from './support';

const BAR_INTERVAL_MS = 3_600_000;

/** The tools with a default shortcut (Alt + letter); the three Fibonacci tools after the retracement are chosen on the toolbar. */
const SHORTCUTS: readonly { readonly key: string; readonly kind: string }[] = [
  { key: 'Alt+t', kind: 'trend-line' },
  { key: 'Alt+h', kind: 'horizontal-line' },
  { key: 'Alt+r', kind: 'rectangle' },
  { key: 'Alt+f', kind: 'fibonacci-retracement' },
  { key: 'Alt+n', kind: 'text-note' },
];

/** Presses Tab until the element found by `locator` has focus. */
async function tabTo(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('The element never received focus.');
}

async function activeTool(page: Page): Promise<string | null | undefined> {
  return page.evaluate(() => window.playground?.tools.getState().activeTool);
}

/** Places the drawing at the keyboard cursor: Enter, and for a two-anchor tool move the cursor and Enter again. A note then gets its text. */
async function placeWithKeys(page: Page, anchors: 1 | 2, kind: string): Promise<void> {
  await page.keyboard.press('Enter');
  if (anchors === 2) {
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Enter');
  }
  if (kind === 'text-note') await typeNote(page, 'Keyboard note');
}

/** Selects everything, nudges, undoes and redoes, then deletes: the drawing is the only one, so every step is checked against it. */
async function manage(page: Page): Promise<void> {
  const [placed] = await drawings(page);
  await page.keyboard.press('Control+a');
  await expect.poll(async () => (await selection(page)).length).toBe(1);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await drawings(page))[0].anchors[0].time).toBe(placed.anchors[0].time + BAR_INTERVAL_MS);
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await drawings(page))[0].anchors[0].price).toBeGreaterThan(placed.anchors[0].price);
  await page.keyboard.press('Delete');
  await expectDrawings(page, 0);
  await page.keyboard.press('Control+z');
  await expectDrawings(page, 1);
  await page.keyboard.press('Control+y');
  await expectDrawings(page, 0);
}

test.describe('the whole product by keyboard only', () => {
  test.beforeEach(async ({ page }) => {
    await openPlayground(page);
  });

  for (const tool of TOOLS as readonly ToolSpec[]) {
    test(`${tool.label}: choose on the toolbar, place, select, nudge, delete, undo and redo`, async ({ page }) => {
      await tabTo(page, page.getByRole('button', { name: tool.label }));
      await page.keyboard.press('Enter');
      await expect.poll(() => activeTool(page)).toBe(tool.kind);
      await tabTo(page, page.locator('#chart'));
      await placeWithKeys(page, tool.anchors, tool.kind);
      await expectDrawings(page, 1);
      expect((await drawings(page))[0].kind).toBe(tool.kind);
      await manage(page);
    });
  }

  for (const shortcut of SHORTCUTS) {
    test(`${shortcut.key} chooses ${shortcut.kind}; Escape cancels a placement that has begun`, async ({ page }) => {
      const tool = TOOLS.find((candidate) => candidate.kind === shortcut.kind) as ToolSpec;
      await tabTo(page, page.locator('#chart'));
      await page.keyboard.press(shortcut.key);
      await expect.poll(() => activeTool(page)).toBe(shortcut.kind);

      // Begin, then cancel: nothing is placed, and Escape leaves the tool, so the shortcut chooses it again.
      if (tool.anchors === 2) {
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Escape');
        await expectDrawings(page, 0);
        await expect.poll(() => activeTool(page)).toBeNull();
        await page.keyboard.press(shortcut.key);
        await expect.poll(() => activeTool(page)).toBe(shortcut.kind);
      }
      if (tool.kind === 'text-note') {
        await page.keyboard.press('Enter');
        await expect(page.getByRole('textbox', { name: 'Note text' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveCount(0);
        await expectDrawings(page, 0);
        await page.locator('#chart').focus();
        await page.keyboard.press(shortcut.key);
        await expect.poll(() => activeTool(page)).toBe(shortcut.kind);
      }
      await page.keyboard.press('Enter');

      // Place for real.
      if (tool.anchors === 2) {
        for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Shift+ArrowUp');
        await page.keyboard.press('Enter');
      }
      if (tool.kind === 'text-note') await typeNote(page, 'Shortcut note');
      await expectDrawings(page, 1);
      expect((await drawings(page))[0].kind).toBe(shortcut.kind);

      // Duplicate with Ctrl+D, deselect with Escape, select all, delete with Backspace.
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Control+d');
      await expectDrawings(page, 2);
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await selection(page)).length).toBe(0);
      await page.keyboard.press('Control+a');
      await expect.poll(async () => (await selection(page)).length).toBe(2);
      await page.keyboard.press('Backspace');
      await expectDrawings(page, 0);
    });
  }

  test('a text note is edited with the keyboard: Enter opens the editor, Escape cancels, Ctrl+Enter confirms', async ({ page }) => {
    await tabTo(page, page.locator('#chart'));
    await page.keyboard.press('Alt+n');
    await page.keyboard.press('Enter');
    await typeNote(page, 'First');
    await expectDrawings(page, 1);

    await page.keyboard.press('Control+a');
    await page.keyboard.press('Enter');
    const editor = page.getByRole('textbox', { name: 'Note text' });
    await expect(editor).toBeVisible();
    await editor.fill('Discarded');
    await editor.press('Escape');
    await expect(editor).toHaveCount(0);
    expect((await drawings(page))[0].text).toBe('First');

    await page.keyboard.press('Enter');
    await expect(editor).toBeVisible();
    await editor.fill('Second');
    await editor.press('Control+Enter');
    await expect(editor).toHaveCount(0);
    await expect.poll(async () => (await drawings(page))[0].text).toBe('Second');
  });
});
