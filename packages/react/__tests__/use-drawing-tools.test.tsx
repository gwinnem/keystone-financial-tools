import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { DARK_THEME, DrawingStore, IDLE_STATE, IDLE_TOOLBAR, TOOL_CATALOG, type Drawing, type DrawingHost, type TextEditRequest } from 'keystone-financial-tools-core';
import { createMockHost, type MockHost, type MockHostOptions } from 'keystone-financial-tools-core/testing';
import { useDrawingTools, type UseDrawingToolsOptions } from '../src/use-drawing-tools';

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
const Strict = ({ children }: { children: ReactNode }): ReactNode => <StrictMode>{children}</StrictMode>;

interface Props {
  readonly host: DrawingHost | null | undefined;
  readonly options?: UseDrawingToolsOptions;
}

const render = (host: DrawingHost | null | undefined, options?: UseDrawingToolsOptions, wrapper?: typeof Strict) =>
  renderHook(({ host, options }: Props) => useDrawingTools(host, options), { initialProps: { host, options } as Props, wrapper });
const hostOf = (options?: MockHostOptions): MockHost => createMockHost(options);

/** Places a note at (100, 200): the tool is active, so a click opens its text editor. */
function placeNote(host: MockHost, result: { current: { activate(kind: 'text-note'): void } }): void {
  act(() => result.current.activate('text-note'));
  act(() => {
    host.pointer('down', 100, 200);
    host.pointer('up', 100, 200);
  });
}

afterEach(cleanup);

describe('useDrawingTools', () => {
  describe('without a host', () => {
    it('has no controller, an idle state and actions that do nothing', () => {
      const { result } = render(null, { magnet: 'weak' });
      expect(result.current.tools).toBeNull();
      expect(result.current.state).toStrictEqual({ activeTool: null, interaction: IDLE_STATE, selection: [], hover: null, canUndo: false, canRedo: false, magnet: 'weak', toolbar: IDLE_TOOLBAR });
      expect(result.current.toolbar).toBe(IDLE_TOOLBAR);
      expect(result.current.toolbar.map((entry) => entry.id)).toStrictEqual(TOOL_CATALOG.map((entry) => entry.id));
      expect(result.current.toolbar.some((entry) => entry.enabled || entry.active)).toBe(false);
      act(() => {
        result.current.activate('trend-line');
        result.current.deactivate();
        result.current.select(['t']);
        result.current.clearSelection();
        result.current.remove(['t']);
        result.current.setMagnet('strong');
        result.current.setTheme(DARK_THEME);
        result.current.setOptions({ stayInTool: true });
      });
      expect(result.current.undo()).toBe(false);
      expect(result.current.redo()).toBe(false);
      expect(result.current.state.activeTool).toBeNull();
    });

    it('follows the magnet of the options while there is no host', () => {
      const { result, rerender } = render(null, { magnet: 'weak' });
      expect(result.current.state.magnet).toBe('weak');
      rerender({ host: null, options: { magnet: 'strong' } });
      expect(result.current.state.magnet).toBe('strong');
    });

    it('is the same with an undefined host, and the magnet is off by default', () => {
      const { result } = render(undefined);
      expect(result.current.tools).toBeNull();
      expect(result.current.state.magnet).toBe('off');
    });

    it('still has a store and the drawings in it', () => {
      const store = new DrawingStore([NOTE]);
      const { result } = render(null, { store });
      expect(result.current.store).toBe(store);
      expect(result.current.drawings).toBe(store.list());
      act(() => store.remove('t'));
      expect(result.current.drawings).toStrictEqual([]);
    });

    it('creates a store and keeps it across renders', () => {
      const { result, rerender } = render(null);
      const first = result.current.store;
      expect(first).toBeInstanceOf(DrawingStore);
      rerender({ host: null });
      expect(result.current.store).toBe(first);
    });
  });

  describe('with a host', () => {
    it('creates the controller once mounted and connects it to the host', () => {
      const host = hostOf();
      const { result } = render(host, { magnet: 'weak', tools: ['trend-line'] });
      expect(result.current.tools).not.toBeNull();
      expect(host.listenerCount('pointer')).toBe(1);
      expect(result.current.state.magnet).toBe('weak');
      expect(() => result.current.activate('rectangle')).toThrow();
    });

    it('draws into the given store', () => {
      const store = new DrawingStore([LINE]);
      const { result } = render(hostOf(), { store });
      expect(result.current.store).toBe(store);
      expect(result.current.tools?.getScene().length).toBeGreaterThan(0);
    });

    it('keeps the state, a new object for each change', () => {
      const { result } = render(hostOf(), { store: new DrawingStore([NOTE]) });
      const first = result.current.state;
      expect(first).toBe(result.current.tools?.getState());
      act(() => result.current.select(['t']));
      expect(result.current.state).not.toBe(first);
      expect(result.current.state.selection).toStrictEqual(['t']);
      act(() => result.current.clearSelection());
      expect(result.current.state.selection).toStrictEqual([]);
    });

    it('has the toolbar: all tools from the catalog, the active one marked, a new array only when an entry changes', () => {
      const host = hostOf();
      const { result } = render(host, { store: new DrawingStore([LINE]) });
      const first = result.current.toolbar;
      expect(first).toBe(result.current.state.toolbar);
      expect(first).not.toBe(IDLE_TOOLBAR);
      expect(first.map((entry) => entry.id)).toStrictEqual(TOOL_CATALOG.map((entry) => entry.id));
      expect(first.every((entry) => entry.enabled && !entry.active)).toBe(true);
      act(() => result.current.select(['l']));
      expect(result.current.toolbar).toBe(first);
      act(() => result.current.activate('rectangle'));
      expect(result.current.toolbar).not.toBe(first);
      expect(result.current.toolbar.filter((entry) => entry.active).map((entry) => entry.id)).toStrictEqual(['rectangle']);
      act(() => {
        host.key('Escape');
      });
      expect(result.current.toolbar.some((entry) => entry.active)).toBe(false);
    });

    it('enables the tools of the tools option only, and passes the shortcuts option', () => {
      const { result } = render(hostOf(), { tools: ['trend-line'], shortcuts: { 'trend-line': 'Alt+L' } });
      expect(result.current.toolbar.filter((entry) => entry.enabled).map((entry) => entry.id)).toStrictEqual(['trend-line']);
      expect(result.current.toolbar[0]?.shortcut).toBe('Alt+L');
      act(() => result.current.setOptions({ tools: ['rectangle'] }));
      expect(result.current.toolbar.filter((entry) => entry.enabled).map((entry) => entry.id)).toStrictEqual(['rectangle']);
    });

    it('activates a tool with its shortcut and follows it in the toolbar', () => {
      const host = hostOf();
      const { result } = render(host);
      let handled = false;
      act(() => {
        handled = host.key('t', { altKey: true });
      });
      expect(handled).toBe(true);
      expect(result.current.toolbar.find((entry) => entry.id === 'trend-line')?.active).toBe(true);
    });

    it('forwards the actions to the controller', () => {
      const { result } = render(hostOf(), { store: new DrawingStore([NOTE]) });
      act(() => result.current.activate('trend-line'));
      expect(result.current.state.activeTool).toBe('trend-line');
      act(() => result.current.deactivate());
      expect(result.current.state.activeTool).toBeNull();
      act(() => result.current.setMagnet('strong'));
      expect(result.current.state.magnet).toBe('strong');
      act(() => result.current.select(['t']));
      act(() => result.current.remove(['t']));
      expect(result.current.drawings).toStrictEqual([]);
      expect(result.current.state.canUndo).toBe(true);
      let undone = false;
      act(() => {
        undone = result.current.undo();
      });
      expect(undone).toBe(true);
      expect(result.current.drawings).toHaveLength(1);
      let redone = false;
      act(() => {
        redone = result.current.redo();
      });
      expect(redone).toBe(true);
      expect(result.current.drawings).toStrictEqual([]);
    });

    it('forwards the theme to the controller', () => {
      const { result } = render(hostOf(), { store: new DrawingStore([LINE]) });
      const before = result.current.tools?.getScene();
      act(() => result.current.setTheme(DARK_THEME));
      expect(result.current.tools?.getScene()).not.toBe(before);
    });

    it('forwards runtime options to the controller', () => {
      const stays = hostOf();
      const a = render(stays, { stayInTool: false });
      act(() => a.result.current.setOptions({ stayInTool: true }));
      act(() => a.result.current.activate('horizontal-line'));
      act(() => {
        stays.pointer('down', 100, 200);
        stays.pointer('up', 100, 200);
      });
      expect(a.result.current.state.activeTool).toBe('horizontal-line');

      const leaves = hostOf();
      const b = render(leaves, { stayInTool: false });
      act(() => b.result.current.activate('horizontal-line'));
      act(() => {
        leaves.pointer('down', 100, 200);
        leaves.pointer('up', 100, 200);
      });
      expect(b.result.current.state.activeTool).toBeNull();
    });

    it('reads the options when the controller is created, also when the host comes later', () => {
      const host = hostOf();
      const { result, rerender } = render(null, { magnet: 'off' });
      rerender({ host, options: { magnet: 'strong' } });
      expect(result.current.state.magnet).toBe('strong');
    });

    it('does not create the controller again for new options', () => {
      const host = hostOf();
      const { result, rerender } = render(host, { magnet: 'off' });
      const first = result.current.tools;
      rerender({ host, options: { magnet: 'strong' } });
      expect(result.current.tools).toBe(first);
      expect(result.current.state.magnet).toBe('off');
    });
  });

  describe('when the host or the store changes, or the component unmounts', () => {
    it('destroys the controller and releases the host on unmount', () => {
      const host = hostOf();
      const { unmount } = render(host);
      expect(host.listenerCount('pointer')).toBe(1);
      unmount();
      expect(host.listenerCount('pointer')).toBe(0);
      expect(host.listenerCount('key')).toBe(0);
      expect(host.listenerCount('viewport')).toBe(0);
    });

    it('moves to a new host', () => {
      const a = hostOf();
      const b = hostOf();
      const { result, rerender } = render(a);
      const first = result.current.tools;
      rerender({ host: b });
      expect(a.listenerCount('pointer')).toBe(0);
      expect(b.listenerCount('pointer')).toBe(1);
      expect(result.current.tools).not.toBe(first);
    });

    it('goes back to no controller and an idle state when the host goes away', () => {
      const host = hostOf();
      const { result, rerender } = render(host, { store: new DrawingStore([NOTE]) });
      act(() => result.current.select(['t']));
      rerender({ host: null, options: { store: result.current.store } });
      expect(host.listenerCount('pointer')).toBe(0);
      expect(result.current.tools).toBeNull();
      expect(result.current.state.selection).toStrictEqual([]);
    });

    it('creates the controller again for another store', () => {
      const host = hostOf();
      const a = new DrawingStore();
      const b = new DrawingStore([NOTE]);
      const { result, rerender } = render(host, { store: a });
      const first = result.current.tools;
      rerender({ host, options: { store: b } });
      expect(result.current.tools).not.toBe(first);
      expect(result.current.store).toBe(b);
      expect(host.listenerCount('pointer')).toBe(1);
    });

    it('creates one controller per mount in StrictMode, and leaves no listener behind', () => {
      // One controller subscribes to the viewport more than once (its caches do too), so StrictMode is compared with a plain mount.
      const plain = hostOf();
      render(plain);
      const host = hostOf();
      const { result, unmount } = render(host, undefined, Strict);
      expect(result.current.tools).not.toBeNull();
      expect(host.listenerCount('pointer')).toBe(1);
      expect(host.listenerCount('key')).toBe(1);
      expect(host.listenerCount('viewport')).toBe(plain.listenerCount('viewport'));
      expect(host.listenerCount('viewport')).toBeGreaterThan(0);
      unmount();
      expect(host.listenerCount('pointer')).toBe(0);
      expect(host.listenerCount('key')).toBe(0);
      expect(host.listenerCount('viewport')).toBe(0);
    });
  });

  describe('the text editor', () => {
    it('opens the default editor for a new note and applies the confirmed text', async () => {
      const host = hostOf();
      const { result } = render(host);
      placeNote(host, result);
      const session = result.current.textEdit;
      expect(session?.request).toMatchObject({ text: '', x: 100, y: 200 });
      await act(async () => {
        session?.confirm('typed');
        await flush();
      });
      expect(result.current.textEdit).toBeNull();
      expect(result.current.drawings[0]?.text).toBe('typed');
    });

    it('takes a new note back when the default editor is cancelled', async () => {
      const host = hostOf();
      const { result } = render(host);
      placeNote(host, result);
      await act(async () => {
        result.current.textEdit?.cancel();
        await flush();
      });
      expect(result.current.drawings).toStrictEqual([]);
      expect(result.current.textEdit).toBeNull();
    });

    it('opens the default editor for an existing note on Enter', () => {
      const host = hostOf();
      const { result } = render(host, { store: new DrawingStore([NOTE]) });
      act(() => result.current.select(['t']));
      act(() => {
        host.key('Enter');
      });
      expect(result.current.textEdit?.request).toMatchObject({ drawingId: 't', text: 'hi' });
    });

    it('uses the editor of the options instead of the default', async () => {
      const requests: TextEditRequest[] = [];
      const host = hostOf();
      const { result } = render(host, { editText: (request) => (requests.push(request), Promise.resolve('custom')) });
      placeNote(host, result);
      await act(flush);
      expect(requests).toHaveLength(1);
      expect(result.current.textEdit).toBeNull();
      expect(result.current.drawings[0]?.text).toBe('custom');
    });

    it('leaves the note empty without an editor when editText is false', async () => {
      const host = hostOf();
      const { result } = render(host, { editText: false });
      const errors: unknown[] = [];
      result.current.tools?.on('error', (error) => errors.push(error));
      placeNote(host, result);
      await act(flush);
      expect(errors).toStrictEqual([]);
      expect(result.current.textEdit).toBeNull();
      expect(result.current.drawings[0]?.text).toBe('');
    });

    it('prefers the editor of the host', async () => {
      const host = hostOf({ editText: () => Promise.resolve('from host') });
      const { result } = render(host);
      placeNote(host, result);
      await act(flush);
      expect(result.current.textEdit).toBeNull();
      expect(result.current.drawings[0]?.text).toBe('from host');
    });

    it('closes an open editor without applying anything when the controller goes', async () => {
      const host = hostOf();
      const { result, rerender } = render(host);
      placeNote(host, result);
      const session = result.current.textEdit;
      expect(session).not.toBeNull();
      rerender({ host: null, options: { store: result.current.store } });
      expect(result.current.textEdit).toBeNull();
      await act(async () => {
        session?.confirm('too late');
        await flush();
      });
      expect(result.current.store.list()[0]?.text).toBe('');
    });
  });
});
