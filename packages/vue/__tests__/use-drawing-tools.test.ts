import { describe, expect, it } from 'vitest';
import { effectScope } from 'vue';
import { DARK_THEME, DrawingStore, TOOL_CATALOG, type Drawing, type TextEditRequest } from 'keystone-financial-tools-core';
import { createMockHost, type MockHost, type MockHostOptions } from 'keystone-financial-tools-core/testing';
import { useDrawingTools, type UseDrawingTools, type UseDrawingToolsOptions } from '../src/use-drawing-tools';

const NOTE: Drawing = { id: 't', kind: 'text-note', anchors: [{ time: 600_000, price: 100, yAxisId: 'price' }], text: 'hi' };
const LINE: Drawing = {
  id: 'l',
  kind: 'trend-line',
  anchors: [
    { time: 600_000, price: 100, yAxisId: 'price' },
    { time: 1_200_000, price: 120, yAxisId: 'price' },
  ],
};
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options?: UseDrawingToolsOptions, hostOptions?: MockHostOptions): { host: MockHost; result: UseDrawingTools; stop: () => void } {
  const host = createMockHost(hostOptions);
  const scope = effectScope();
  const result = scope.run(() => useDrawingTools(host, options));
  if (result === undefined) throw new Error('scope did not run');
  return { host, result, stop: () => scope.stop() };
}

/** Places a note at (100, 200): the tool is active, so a click opens its text editor. */
function placeNote({ host, result }: { host: MockHost; result: UseDrawingTools }): void {
  result.activate('text-note');
  host.pointer('down', 100, 200);
  host.pointer('up', 100, 200);
}

describe('useDrawingTools', () => {
  it('draws into the given store and follows it', () => {
    const store = new DrawingStore([NOTE]);
    const { result } = setup({ store });
    expect(result.store).toBe(store);
    expect(result.drawings.value).toBe(store.list());
    store.remove('t');
    expect(result.drawings.value).toStrictEqual([]);
  });

  it('creates a store when none is given', () => {
    const { result } = setup();
    expect(result.store).toBeInstanceOf(DrawingStore);
    expect(result.drawings.value).toStrictEqual([]);
  });

  it('passes the options to the controller', () => {
    const { result } = setup({ magnet: 'weak', tools: ['trend-line'] });
    expect(result.state.value.magnet).toBe('weak');
    expect(() => result.activate('rectangle')).toThrow();
  });

  it('keeps the state in a ref, a new object for each change', () => {
    const { result } = setup({ store: new DrawingStore([NOTE]) });
    const first = result.state.value;
    expect(first).toBe(result.tools.getState());
    result.select(['t']);
    expect(result.state.value).not.toBe(first);
    expect(result.state.value.selection).toStrictEqual(['t']);
    result.clearSelection();
    expect(result.state.value.selection).toStrictEqual([]);
  });

  it('keeps the toolbar in a ref: all tools from the catalog, the active one marked, a new array only when an entry changes', () => {
    const { host, result } = setup({ store: new DrawingStore([LINE]) });
    const first = result.toolbar.value;
    expect(first).toBe(result.tools.getState().toolbar);
    expect(first.map((entry) => entry.id)).toStrictEqual(TOOL_CATALOG.map((entry) => entry.id));
    expect(first.every((entry) => entry.enabled && !entry.active)).toBe(true);
    result.select(['l']);
    expect(result.toolbar.value).toBe(first);
    result.activate('rectangle');
    expect(result.toolbar.value).not.toBe(first);
    expect(result.toolbar.value.filter((entry) => entry.active).map((entry) => entry.id)).toStrictEqual(['rectangle']);
    host.key('Escape');
    expect(result.toolbar.value.some((entry) => entry.active)).toBe(false);
  });

  it('enables the tools of the tools option only, and passes the shortcuts option', () => {
    const { result } = setup({ tools: ['trend-line'], shortcuts: { 'trend-line': 'Alt+L' } });
    expect(result.toolbar.value.filter((entry) => entry.enabled).map((entry) => entry.id)).toStrictEqual(['trend-line']);
    expect(result.toolbar.value[0]?.shortcut).toBe('Alt+L');
    result.setOptions({ tools: ['rectangle'] });
    expect(result.toolbar.value.filter((entry) => entry.enabled).map((entry) => entry.id)).toStrictEqual(['rectangle']);
  });

  it('activates a tool with its shortcut and follows it in the toolbar', () => {
    const { host, result } = setup();
    expect(host.key('t', { altKey: true })).toBe(true);
    expect(result.toolbar.value.find((entry) => entry.id === 'trend-line')?.active).toBe(true);
  });

  it('forwards the actions to the controller', () => {
    const { host, result } = setup({ store: new DrawingStore([NOTE]) });
    result.activate('trend-line');
    expect(result.state.value.activeTool).toBe('trend-line');
    result.deactivate();
    expect(result.state.value.activeTool).toBeNull();
    result.setMagnet('strong');
    expect(result.state.value.magnet).toBe('strong');
    result.select(['t']);
    result.remove(['t']);
    expect(result.drawings.value).toStrictEqual([]);
    expect(result.state.value.canUndo).toBe(true);
    expect(result.undo()).toBe(true);
    expect(result.drawings.value).toHaveLength(1);
    expect(result.redo()).toBe(true);
    expect(result.drawings.value).toStrictEqual([]);
    expect(host.renderRequests).toBeGreaterThan(0);
  });

  it('forwards the theme to the controller', () => {
    const { result } = setup({ store: new DrawingStore([LINE]) });
    const before = result.tools.getScene();
    result.setTheme(DARK_THEME);
    expect(result.tools.getScene()).not.toBe(before);
  });

  it('forwards runtime options to the controller', () => {
    const stays = setup({ stayInTool: false });
    stays.result.setOptions({ stayInTool: true });
    stays.result.activate('horizontal-line');
    stays.host.pointer('down', 100, 200);
    stays.host.pointer('up', 100, 200);
    expect(stays.result.state.value.activeTool).toBe('horizontal-line');

    const leaves = setup({ stayInTool: false });
    leaves.result.activate('horizontal-line');
    leaves.host.pointer('down', 100, 200);
    leaves.host.pointer('up', 100, 200);
    expect(leaves.result.state.value.activeTool).toBeNull();
  });

  describe('the text editor', () => {
    it('opens the default editor for a new note and applies the confirmed text', async () => {
      const setupResult = setup();
      placeNote(setupResult);
      const { result } = setupResult;
      const session = result.textEdit.value;
      expect(session?.request).toMatchObject({ text: '', x: 100, y: 200 });
      session?.confirm('typed');
      expect(result.textEdit.value).toBeNull();
      await flush();
      expect(result.drawings.value[0]?.text).toBe('typed');
    });

    it('takes a new note back when the default editor is cancelled', async () => {
      const setupResult = setup();
      placeNote(setupResult);
      setupResult.result.textEdit.value?.cancel();
      await flush();
      expect(setupResult.result.drawings.value).toStrictEqual([]);
      expect(setupResult.result.textEdit.value).toBeNull();
    });

    it('opens the default editor for an existing note on Enter', () => {
      const { host, result } = setup({ store: new DrawingStore([NOTE]) });
      result.select(['t']);
      host.key('Enter');
      expect(result.textEdit.value?.request).toMatchObject({ drawingId: 't', text: 'hi' });
    });

    it('uses the editor of the options instead of the default', async () => {
      const requests: TextEditRequest[] = [];
      const setupResult = setup({ editText: (request) => (requests.push(request), Promise.resolve('custom')) });
      placeNote(setupResult);
      await flush();
      expect(requests).toHaveLength(1);
      expect(setupResult.result.textEdit.value).toBeNull();
      expect(setupResult.result.drawings.value[0]?.text).toBe('custom');
    });

    it('leaves the note empty without an editor when editText is false', async () => {
      const setupResult = setup({ editText: false });
      const errors: unknown[] = [];
      setupResult.result.tools.on('error', (error) => errors.push(error));
      placeNote(setupResult);
      await flush();
      expect(errors).toStrictEqual([]);
      expect(setupResult.result.textEdit.value).toBeNull();
      expect(setupResult.result.drawings.value[0]?.text).toBe('');
    });

    it('prefers the editor of the host', async () => {
      const setupResult = setup(undefined, { editText: () => Promise.resolve('from host') });
      placeNote(setupResult);
      await flush();
      expect(setupResult.result.textEdit.value).toBeNull();
      expect(setupResult.result.drawings.value[0]?.text).toBe('from host');
    });
  });

  describe('when the scope is disposed', () => {
    it('removes the listeners of the host and stops following the store and the tools', () => {
      const store = new DrawingStore();
      const { host, result, stop } = setup({ store });
      expect(host.listenerCount('pointer')).toBe(1);
      stop();
      expect(host.listenerCount('pointer')).toBe(0);
      expect(host.listenerCount('key')).toBe(0);
      expect(host.listenerCount('viewport')).toBe(0);
      const state = result.state.value;
      result.tools.select([]);
      store.add(NOTE);
      expect(result.drawings.value).toStrictEqual([]);
      expect(result.state.value).toBe(state);
    });

    it('closes an open editor without applying anything', async () => {
      const setupResult = setup();
      placeNote(setupResult);
      const session = setupResult.result.textEdit.value;
      expect(session).not.toBeNull();
      setupResult.stop();
      expect(setupResult.result.textEdit.value).toBeNull();
      session?.confirm('too late');
      await flush();
      expect(setupResult.result.store.list()[0]?.text).toBe('');
    });
  });
});
