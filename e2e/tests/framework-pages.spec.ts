import { expect, test, type Page } from '@playwright/test';

// The same demo page for every framework (FR-DOC-010): a labelled, keyboard-operable toolbar made from the tools' own toolbar state,
// undo and redo, the magnet, and drawings that survive a reload.
const PAGES = [
  { name: 'TypeScript', path: '/index.html' },
  { name: 'Vue', path: '/vue.html' },
  { name: 'React', path: '/react.html' },
  { name: 'Angular', path: '/angular.html' },
] as const;

const TOOLS = ['Trend line', 'Horizontal line', 'Rectangle', 'Fibonacci retracement', 'Fibonacci arcs', 'Fibonacci fans', 'Fibonacci time zones', 'Text note'];

async function chartBox(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('#chart').boundingBox();
  if (box === null) throw new Error('The chart is not visible.');
  return box;
}

for (const { name, path } of PAGES) {
  test.describe(`${name} page`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('toolbar', { name: 'Drawing tools' })).toBeVisible();
    });

    test('has a labelled button for every tool, undo, redo, delete and magnet, and links to the other pages', async ({ page }) => {
      const toolbar = page.getByRole('toolbar', { name: 'Drawing tools' });
      for (const label of [...TOOLS, 'Undo', 'Redo', 'Delete', 'Magnet']) await expect(toolbar.getByRole('button', { name: label })).toBeVisible();
      const nav = page.getByRole('navigation', { name: 'Demo pages' });
      for (const other of PAGES) await expect(nav.getByRole('link', { name: other.name })).toBeVisible();
      await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    });

    test('reaches the toolbar with the keyboard and chooses a tool with Enter', async ({ page }) => {
      const trendLine = page.getByRole('button', { name: 'Trend line' });
      await trendLine.focus();
      await expect(trendLine).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(trendLine).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('Enter');
      await expect(trendLine).toHaveAttribute('aria-pressed', 'false');
    });

    test('places a drawing, undoes and redoes it, and keeps it after a reload', async ({ page }) => {
      const status = page.getByRole('status');
      const undo = page.getByRole('button', { name: 'Undo' });
      await expect(undo).toBeDisabled();
      await page.getByRole('button', { name: 'Trend line' }).click();
      const box = await chartBox(page);
      await page.mouse.click(box.x + 200, box.y + 100);
      await page.mouse.click(box.x + 450, box.y + 180);
      await expect(status).toContainText('1 drawing');
      await expect(undo).toBeEnabled();
      await undo.click();
      await expect(status).toContainText('0 drawings');
      await page.getByRole('button', { name: 'Redo' }).click();
      await expect(status).toContainText('1 drawing');
      // The page saves shortly after the change: wait until the document is in localStorage.
      await expect.poll(() => page.evaluate(() => Object.keys(localStorage).length)).toBeGreaterThan(0);
      await page.reload();
      await expect(page.getByRole('status')).toContainText('1 drawing');
    });

    test('switches the magnet on and off', async ({ page }) => {
      const magnet = page.getByRole('button', { name: 'Magnet' });
      await expect(magnet).not.toHaveAttribute('aria-pressed', 'true');
      await magnet.click();
      await expect(magnet).toHaveAttribute('aria-pressed', 'true');
      await magnet.click();
      await expect(magnet).toHaveAttribute('aria-pressed', 'false');
    });

    test('draws two panes on the chart, zooms with the keyboard', async ({ page }) => {
      await expect(page.locator('#chart canvas')).toHaveCount(2);
      await page.locator('#chart').focus();
      const canvas = page.locator('#chart canvas#base');
      const before = await canvas.screenshot();
      await page.keyboard.press('+');
      await expect.poll(async () => Buffer.compare(before, await canvas.screenshot())).not.toBe(0);
    });
  });
}
