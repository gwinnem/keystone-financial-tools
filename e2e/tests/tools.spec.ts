import { expect, test, type Page } from '@playwright/test';
import { TOOLS, barPoint, bodyPoint, drag, drawings, expectDrawings, handlePoint, openPlayground, place, placeByDrag, plotPoint, selection, type Pixel, type ToolSpec } from './support';

/** Plot-local anchors (CSS px from the top left of the plot, inside the 300 px price pane): one set for the first drawing, one for the second. */
const FIRST = [
  { x: 150, y: 60 },
  { x: 350, y: 140 },
];
const SECOND = [
  { x: 450, y: 150 },
  { x: 650, y: 230 },
];

async function anchorsOf(page: Page, tool: ToolSpec, set: readonly Pixel[]): Promise<Pixel[]> {
  const wanted = tool.anchors === 2 ? set : [{ x: (set[0].x + set[1].x) / 2, y: (set[0].y + set[1].y) / 2 }];
  return Promise.all(wanted.map((point) => plotPoint(page, point.x, point.y)));
}

/** Clicks empty space in the top left corner of the plot: clears the selection and focuses the chart. */
async function clickEmpty(page: Page): Promise<void> {
  const point = await plotPoint(page, 8, 8);
  await page.mouse.click(point.x, point.y);
}

async function waitSaved(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).length)).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await openPlayground(page);
});

for (const tool of TOOLS) {
  test.describe(tool.label, () => {
    test('is placed with one click per anchor', async ({ page }) => {
      await place(page, tool, await anchorsOf(page, tool, FIRST));
      const [drawing] = await drawings(page);
      expect(drawing.kind).toBe(tool.kind);
      expect(drawing.anchors).toHaveLength(tool.anchors);
      await expect(page.getByRole('status')).toContainText('1 drawing');
    });

    if (tool.anchors === 2) {
      test('is placed by pressing, dragging and releasing', async ({ page }) => {
        const [from, to] = await anchorsOf(page, tool, FIRST);
        await placeByDrag(page, tool, from, to);
        const [drawing] = await drawings(page);
        expect(drawing.kind).toBe(tool.kind);
        expect(drawing.anchors[1].time).toBeGreaterThan(drawing.anchors[0].time);
      });
    }

    test('snaps its anchors to the bars with the magnet on', async ({ page }) => {
      const magnet = page.getByRole('button', { name: 'Magnet' });
      await magnet.click();
      await expect(magnet).toHaveAttribute('aria-pressed', 'true');
      const indexes = tool.anchors === 2 ? [30, 50] : [30];
      const points = [await barPoint(page, 30, 2, 3), ...(tool.anchors === 2 ? [await barPoint(page, 50, -2, -3)] : [])];
      await place(page, tool, points);
      const [drawing] = await drawings(page);
      const bars = await page.evaluate(() => window.playground?.bars ?? []);
      indexes.forEach((barIndex, i) => {
        const bar = bars[barIndex];
        expect(drawing.anchors[i].time).toBeCloseTo(bar.time, 0);
        expect([bar.open, bar.high, bar.low, bar.close]).toContain(drawing.anchors[i].price);
      });
    });

    test('is selected by clicking it and deselected by clicking empty space', async ({ page }) => {
      const id = await place(page, tool, await anchorsOf(page, tool, FIRST));
      await clickEmpty(page);
      expect(await selection(page)).toHaveLength(0);
      const body = await bodyPoint(page, id);
      await page.mouse.click(body.x, body.y);
      expect(await selection(page)).toStrictEqual([id]);
      await clickEmpty(page);
      expect(await selection(page)).toHaveLength(0);
    });

    test('is moved by dragging its body', async ({ page }) => {
      const id = await place(page, tool, await anchorsOf(page, tool, FIRST));
      const [before] = await drawings(page);
      await clickEmpty(page);
      const body = await bodyPoint(page, id);
      await page.mouse.click(body.x, body.y);
      await drag(page, body, { x: body.x + 40, y: body.y + 30 });
      const [after] = await drawings(page);
      before.anchors.forEach((anchor, i) => {
        expect(after.anchors[i].time).toBeGreaterThan(anchor.time);
        expect(after.anchors[i].price).toBeLessThan(anchor.price);
      });
    });

    if (tool.kind !== 'text-note') {
      test('is resized by dragging a handle', async ({ page }) => {
        const id = await place(page, tool, await anchorsOf(page, tool, FIRST));
        const [before] = await drawings(page);
        await clickEmpty(page);
        const body = await bodyPoint(page, id);
        await page.mouse.click(body.x, body.y);
        const handle = await handlePoint(page, id, 0);
        await drag(page, handle, { x: handle.x - 40, y: handle.y + 30 });
        const [after] = await drawings(page);
        expect(after.anchors).not.toStrictEqual(before.anchors);
        expect(after.id).toBe(before.id);
      });
    }

    test('is selected together with another drawing by Shift+click, and both move together', async ({ page }) => {
      const first = await place(page, tool, await anchorsOf(page, tool, FIRST));
      const second = await place(page, tool, await anchorsOf(page, tool, SECOND));
      await clickEmpty(page);
      const firstBody = await bodyPoint(page, first);
      const secondBody = await bodyPoint(page, second);
      await page.mouse.click(firstBody.x, firstBody.y);
      await page.keyboard.down('Shift');
      await page.mouse.click(secondBody.x, secondBody.y);
      await page.keyboard.up('Shift');
      expect([...(await selection(page))].sort()).toStrictEqual([first, second].sort());
      const before = await drawings(page);
      await drag(page, firstBody, { x: firstBody.x, y: firstBody.y + 20 });
      const after = await drawings(page);
      for (let i = 0; i < before.length; i++) expect(after[i].anchors[0].price).toBeLessThan(before[i].anchors[0].price);
    });

    test('is selected with every other drawing by Ctrl+A', async ({ page }) => {
      await place(page, tool, await anchorsOf(page, tool, FIRST));
      await place(page, tool, await anchorsOf(page, tool, SECOND));
      await clickEmpty(page);
      await page.keyboard.press('Control+a');
      await expect.poll(async () => (await selection(page)).length).toBe(2);
    });

    test('is removed by Delete and brought back by undo', async ({ page }) => {
      const id = await place(page, tool, await anchorsOf(page, tool, FIRST));
      const [saved] = await drawings(page);
      await clickEmpty(page);
      const body = await bodyPoint(page, id);
      await page.mouse.click(body.x, body.y);
      await page.keyboard.press('Delete');
      await expectDrawings(page, 0);
      await page.keyboard.press('Control+z');
      await expectDrawings(page, 1);
      expect(await drawings(page)).toStrictEqual([saved]);
    });

    test('is undone and redone by keyboard and toolbar', async ({ page }) => {
      await place(page, tool, await anchorsOf(page, tool, FIRST));
      await clickEmpty(page);
      await page.keyboard.press('Control+z');
      await expectDrawings(page, 0);
      await page.keyboard.press('Control+Shift+z');
      await expectDrawings(page, 1);
      await page.getByRole('button', { name: 'Undo' }).click();
      await expectDrawings(page, 0);
      await page.getByRole('button', { name: 'Redo' }).click();
      await expectDrawings(page, 1);
    });

    test('is still there after a reload', async ({ page }) => {
      await place(page, tool, await anchorsOf(page, tool, FIRST));
      const [saved] = await drawings(page);
      await waitSaved(page);
      await page.reload();
      await page.waitForFunction(() => window.playground !== undefined);
      expect(await drawings(page)).toStrictEqual([saved]);
    });
  });
}

test.describe('Text note editing', () => {
  const note = TOOLS[TOOLS.length - 1];

  test('keeps the text typed in the editor', async ({ page }) => {
    await place(page, note, await anchorsOf(page, note, FIRST), 'Breakout');
    const [saved] = await drawings(page);
    expect(saved.text).toBe('Breakout');
  });

  test('is taken back when its editor is cancelled with Escape', async ({ page }) => {
    await page.getByRole('button', { name: 'Text note' }).click();
    const [point] = await anchorsOf(page, note, FIRST);
    await page.mouse.click(point.x, point.y);
    const editor = page.getByRole('textbox', { name: 'Note text' });
    await expect(editor).toBeVisible();
    await editor.press('Escape');
    await expect(editor).toHaveCount(0);
    await expectDrawings(page, 0);
  });

  test('is edited with Enter once selected', async ({ page }) => {
    const id = await place(page, note, await anchorsOf(page, note, FIRST), 'Old');
    await clickEmpty(page);
    const body = await bodyPoint(page, id);
    await page.mouse.click(body.x, body.y);
    await page.keyboard.press('Enter');
    const editor = page.getByRole('textbox', { name: 'Note text' });
    await expect(editor).toHaveValue('Old');
    await editor.fill('New');
    await editor.press('Control+Enter');
    await expect.poll(async () => (await drawings(page))[0].text).toBe('New');
  });

  test('is edited with a double-click, and Escape keeps the old text', async ({ page }) => {
    const id = await place(page, note, await anchorsOf(page, note, FIRST), 'Keep');
    await clickEmpty(page);
    const body = await bodyPoint(page, id);
    await page.mouse.dblclick(body.x, body.y);
    const editor = page.getByRole('textbox', { name: 'Note text' });
    await expect(editor).toHaveValue('Keep');
    await editor.fill('Discard');
    await editor.press('Escape');
    await expect(editor).toHaveCount(0);
    expect((await drawings(page))[0].text).toBe('Keep');
  });

  test('keeps its text after a reload', async ({ page }) => {
    await place(page, note, await anchorsOf(page, note, FIRST), 'Persisted');
    await waitSaved(page);
    await page.reload();
    await page.waitForFunction(() => window.playground !== undefined);
    expect((await drawings(page))[0].text).toBe('Persisted');
  });
});
