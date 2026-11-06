import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

// NFR-A11Y-001, E09-F03-S01: every demo page shows the announce events of the tools in a polite live region that nobody sees. The region
// is the only element with aria-live="polite" (the status line under the chart is not a live region).
const PAGES = [
  { name: 'TypeScript', path: '/index.html' },
  { name: 'Vue', path: '/vue.html' },
  { name: 'React', path: '/react.html' },
  { name: 'Angular', path: '/angular.html' },
] as const;

const NBSP = String.fromCharCode(160);

async function chartBox(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('#chart').boundingBox();
  if (box === null) throw new Error('The chart is not visible.');
  return box;
}

/** Chooses the trend line tool and places a line with two clicks, `dy` px lower than the first one. */
async function placeLine(page: Page, dy = 0): Promise<void> {
  await page.getByRole('button', { name: 'Trend line' }).click();
  const box = await chartBox(page);
  await page.mouse.click(box.x + 200, box.y + 100 + dy);
  await page.mouse.click(box.x + 450, box.y + 180 + dy);
}

async function focusChart(page: Page): Promise<void> {
  await page.locator('#chart').focus();
  await expect(page.locator('#chart')).toBeFocused();
}

for (const { name, path } of PAGES) {
  test.describe(`${name} page`, () => {
    let live: Locator;

    test.beforeEach(async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toBeVisible();
      live = page.locator('[aria-live="polite"]');
    });

    test('has one polite live region that is read as a whole, is empty at first and has no role', async () => {
      await expect(live).toHaveCount(1);
      await expect(live).toHaveAttribute('aria-atomic', 'true');
      await expect(live).not.toHaveAttribute('role', /.+/);
      await expect(live).toHaveText('');
    });

    test('is hidden from the eye, takes no room and is still in the accessibility tree', async ({ page }) => {
      await expect(live).toBeAttached();
      const box = await live.boundingBox();
      expect(box === null || (box.width <= 1 && box.height <= 1)).toBe(true);
      await expect(live).not.toHaveCSS('display', 'none');
      await expect(live).not.toHaveCSS('visibility', 'hidden');
      await expect(live).toHaveCSS('position', 'absolute');
      // The status line is not a second live region: it would say everything twice.
      await expect(page.locator('#status')).toHaveAttribute('aria-live', 'off');
    });

    test('announces a placed drawing, its selection, an undo and a redo, and a delete', async ({ page }) => {
      await placeLine(page);
      await expect(live).toHaveText('Trend line placed');
      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(live).toHaveText('Undone');
      await page.getByRole('button', { name: 'Redo' }).click();
      await expect(live).toHaveText('Redone');
      const box = await chartBox(page);
      await page.mouse.click(box.x + 326, box.y + 141);
      await expect(live).toHaveText('Trend line selected');
      await page.getByRole('button', { name: 'Delete' }).click();
      await expect(live).toHaveText('Trend line deleted');
    });

    test('announces with the keyboard: the placement, the keys of undo and redo, select all and delete', async ({ page }) => {
      await focusChart(page);
      await page.keyboard.press('Alt+t');
      await page.keyboard.press('Enter');
      for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Shift+ArrowUp');
      await page.keyboard.press('Enter');
      await expect(live).toHaveText('Trend line placed');
      await page.keyboard.press('Control+z');
      await expect(live).toHaveText('Undone');
      await page.keyboard.press('Control+y');
      await expect(live).toHaveText('Redone');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+a');
      await expect(live).toHaveText('Trend line selected');
      await page.keyboard.press('Delete');
      await expect(live).toHaveText('Trend line deleted');
    });

    test('announces the tool a keyboard shortcut chooses, and not the one a toolbar button chooses', async ({ page }) => {
      await focusChart(page);
      await page.keyboard.press('Alt+t');
      await expect(live).toHaveText('Trend line tool active');
      await page.keyboard.press('Alt+h');
      await expect(live).toHaveText('Horizontal line tool active');
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await expect(page.getByRole('button', { name: 'Rectangle' })).toHaveAttribute('aria-pressed', 'true');
      await expect(live).toHaveJSProperty('textContent', 'Horizontal line tool active');
    });

    test('counts the drawings when several are selected or deleted', async ({ page }) => {
      await placeLine(page);
      await placeLine(page, 40);
      await focusChart(page);
      await page.keyboard.press('Control+a');
      await expect(live).toHaveText('2 drawings selected');
      await page.keyboard.press('Delete');
      await expect(live).toHaveText('2 drawings deleted');
    });

    test('changes the text of the region for a message that repeats, so a screen reader reads it again', async ({ page }) => {
      await placeLine(page);
      await expect(live).toHaveJSProperty('textContent', 'Trend line placed');
      await placeLine(page, 40);
      await expect(live).toHaveJSProperty('textContent', `Trend line placed${NBSP}`);
      await placeLine(page, 80);
      await expect(live).toHaveJSProperty('textContent', 'Trend line placed');
    });

    test('says nothing for what does not need saying: choosing a tool, moving the pointer, moving a drawing with the keys', async ({ page }) => {
      await placeLine(page);
      await expect(live).toHaveText('Trend line placed');
      const box = await chartBox(page);
      await page.mouse.move(box.x + 300, box.y + 250);
      await focusChart(page);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Shift+ArrowUp');
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await expect(live).toHaveJSProperty('textContent', 'Trend line placed');
    });

    test('announces a text note when its editor confirms it, and nothing when the editor is cancelled', async ({ page }) => {
      const box = await chartBox(page);
      const editor = page.getByRole('textbox', { name: 'Note text' });
      await page.getByRole('button', { name: 'Text note' }).click();
      await page.mouse.click(box.x + 300, box.y + 150);
      await expect(editor).toBeVisible();
      await editor.press('Escape');
      await expect(editor).toHaveCount(0);
      await expect(live).toHaveText('');
      await page.getByRole('button', { name: 'Text note' }).click();
      await page.mouse.click(box.x + 300, box.y + 150);
      await expect(editor).toBeVisible();
      await editor.fill('Support');
      await editor.press('Control+Enter');
      await expect(editor).toHaveCount(0);
      await expect(live).toHaveText('Text note placed');
    });

    test('has no serious or critical accessibility findings on the page', async ({ page }) => {
      await placeLine(page);
      await expect(live).toHaveText('Trend line placed');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
      expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toStrictEqual([]);
    });
  });
}
