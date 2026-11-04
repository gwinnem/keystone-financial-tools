import { afterEach, describe, expect, it } from 'vitest';
import { Component, inject, provideZonelessChangeDetection, type EnvironmentProviders, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Observable } from 'rxjs';
import { DARK_THEME, DrawingStore, IDLE_STATE, type Drawing, type DrawingHost, type TextEditRequest } from 'keystone-financial-tools-core';
import { createMockHost, type MockHost, type MockHostOptions } from 'keystone-financial-tools-core/testing';
import { KeystoneDrawingToolsService } from './drawing-tools.service';

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
const hostOf = (options?: MockHostOptions): MockHost => createMockHost(options);

function setup(providers: Provider[] = []): KeystoneDrawingToolsService {
  TestBed.configureTestingModule({ providers: [KeystoneDrawingToolsService, ...providers] });
  return TestBed.inject(KeystoneDrawingToolsService);
}

function latest<T>(source: Observable<T>): T | undefined {
  let value: T | undefined;
  source.subscribe((next) => (value = next)).unsubscribe();
  return value;
}

/** Places a note at (100, 200): the tool is active, so a click opens its text editor. */
function placeNote(host: MockHost, service: KeystoneDrawingToolsService): void {
  service.activate('text-note');
  host.pointer('down', 100, 200);
  host.pointer('up', 100, 200);
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('KeystoneDrawingToolsService', () => {
  describe('before a host is attached', () => {
    it('has no controller, an idle state and actions that do nothing', () => {
      const service = setup();
      expect(service.tools()).toBeNull();
      expect(service.state()).toStrictEqual({ activeTool: null, interaction: IDLE_STATE, selection: [], hover: null, canUndo: false, canRedo: false, magnet: 'off' });
      expect(service.drawings()).toStrictEqual([]);
      expect(service.textEdit()).toBeNull();
      service.activate('trend-line');
      service.deactivate();
      service.select(['t']);
      service.clearSelection();
      service.remove(['t']);
      service.setMagnet('strong');
      service.setTheme(DARK_THEME);
      service.setOptions({ stayInTool: true });
      expect(service.undo()).toBe(false);
      expect(service.redo()).toBe(false);
      expect(service.state().activeTool).toBeNull();
      expect(service.state().magnet).toBe('off');
    });

    it('offers every value as an observable that emits the current value on subscribe', () => {
      const service = setup();
      expect(latest(service.tools$)).toBeNull();
      expect(latest(service.state$)).toBe(service.state());
      expect(latest(service.drawings$)).toBe(service.drawings());
      expect(latest(service.textEdit$)).toBeNull();
    });

    it('has a store of its own and follows it', () => {
      const service = setup();
      expect(service.store).toBeInstanceOf(DrawingStore);
      service.store.add(LINE);
      expect(service.drawings()).toStrictEqual([LINE]);
      expect(latest(service.drawings$)).toStrictEqual([LINE]);
    });

    it('can be detached', () => {
      const service = setup();
      expect(() => service.detach()).not.toThrow();
      expect(service.tools()).toBeNull();
    });
  });

  describe('attach', () => {
    it('creates the controller for the host and connects it', () => {
      const host = hostOf();
      const service = setup();
      service.attach(host, { magnet: 'weak', tools: ['trend-line'] });
      expect(service.tools()).not.toBeNull();
      expect(latest(service.tools$)).toBe(service.tools());
      expect(host.listenerCount('pointer')).toBe(1);
      expect(host.listenerCount('key')).toBe(1);
      expect(service.state().magnet).toBe('weak');
      expect(() => service.activate('rectangle')).toThrow();
    });

    it('keeps the state, a new object for each change, as a signal and an observable', () => {
      const service = setup();
      service.attach(hostOf(), { store: new DrawingStore([NOTE]) });
      const first = service.state();
      expect(first).toBe(service.tools()?.getState());
      service.select(['t']);
      expect(service.state()).not.toBe(first);
      expect(service.state().selection).toStrictEqual(['t']);
      expect(latest(service.state$)).toBe(service.state());
      service.clearSelection();
      expect(service.state().selection).toStrictEqual([]);
    });

    it('forwards the actions to the controller', () => {
      const service = setup();
      service.attach(hostOf(), { store: new DrawingStore([NOTE]) });
      service.activate('trend-line');
      expect(service.state().activeTool).toBe('trend-line');
      service.deactivate();
      expect(service.state().activeTool).toBeNull();
      service.setMagnet('strong');
      expect(service.state().magnet).toBe('strong');
      service.select(['t']);
      service.remove(['t']);
      expect(service.drawings()).toStrictEqual([]);
      expect(service.state().canUndo).toBe(true);
      expect(service.undo()).toBe(true);
      expect(service.drawings()).toHaveLength(1);
      expect(service.redo()).toBe(true);
      expect(service.drawings()).toStrictEqual([]);
    });

    it('forwards the theme to the controller', () => {
      const service = setup();
      service.attach(hostOf(), { store: new DrawingStore([LINE]) });
      const before = service.tools()?.getScene();
      service.setTheme(DARK_THEME);
      expect(service.tools()?.getScene()).not.toBe(before);
    });

    it('forwards runtime options to the controller', () => {
      const stays = hostOf();
      const a = setup();
      a.attach(stays, { stayInTool: false });
      a.setOptions({ stayInTool: true });
      a.activate('horizontal-line');
      stays.pointer('down', 100, 200);
      stays.pointer('up', 100, 200);
      expect(a.state().activeTool).toBe('horizontal-line');

      const leaves = hostOf();
      const b = TestBed.runInInjectionContext(() => new KeystoneDrawingToolsService());
      b.attach(leaves, { stayInTool: false });
      b.activate('horizontal-line');
      leaves.pointer('down', 100, 200);
      leaves.pointer('up', 100, 200);
      expect(b.state().activeTool).toBeNull();
    });

    it('draws into the store it is given, and into its own one otherwise', () => {
      const service = setup();
      const given = new DrawingStore([LINE]);
      service.attach(hostOf(), { store: given });
      expect(service.store).toBe(given);
      expect(service.drawings()).toStrictEqual([LINE]);
      expect(service.tools()?.getScene().length).toBeGreaterThan(0);
      given.add(NOTE);
      expect(latest(service.drawings$)).toStrictEqual([LINE, NOTE]);
    });

    it('stops following the store it had when it moves to another one', () => {
      const service = setup();
      const own = service.store;
      const given = new DrawingStore([LINE]);
      service.attach(hostOf(), { store: given });
      own.add(NOTE);
      expect(service.drawings()).toStrictEqual([LINE]);
      service.attach(hostOf());
      expect(service.store).toBe(own);
      expect(service.drawings()).toStrictEqual([NOTE]);
      given.remove('l');
      expect(service.drawings()).toStrictEqual([NOTE]);
    });

    it('destroys the controller of the host it had when it is attached to another', () => {
      const a = hostOf();
      const b = hostOf();
      const service = setup();
      service.attach(a);
      const first = service.tools();
      service.attach(b);
      expect(a.listenerCount('pointer')).toBe(0);
      expect(a.listenerCount('key')).toBe(0);
      expect(a.listenerCount('viewport')).toBe(0);
      expect(b.listenerCount('pointer')).toBe(1);
      expect(service.tools()).not.toBe(first);
    });

    it('does not take a host that is not one, and stays detached', () => {
      const service = setup();
      expect(() => service.attach({} as DrawingHost)).toThrow();
      expect(service.tools()).toBeNull();
    });
  });

  describe('detach', () => {
    it('releases the host, goes back to an idle state and keeps the drawings', () => {
      const host = hostOf();
      const service = setup();
      service.attach(host, { store: new DrawingStore([NOTE]) });
      service.select(['t']);
      service.detach();
      expect(host.listenerCount('pointer')).toBe(0);
      expect(host.listenerCount('key')).toBe(0);
      expect(host.listenerCount('viewport')).toBe(0);
      expect(service.tools()).toBeNull();
      expect(latest(service.tools$)).toBeNull();
      expect(service.state().selection).toStrictEqual([]);
      expect(latest(service.state$)).toBe(service.state());
      expect(service.drawings()).toStrictEqual([NOTE]);
    });

    it('does nothing the second time', () => {
      const host = hostOf();
      const service = setup();
      service.attach(host);
      service.detach();
      service.attach(host);
      service.detach();
      service.detach();
      expect(host.listenerCount('pointer')).toBe(0);
    });
  });

  describe('the text editor', () => {
    it('opens the default editor for a new note and applies the confirmed text', async () => {
      const host = hostOf();
      const service = setup();
      service.attach(host);
      placeNote(host, service);
      const session = service.textEdit();
      expect(session?.request).toMatchObject({ text: '', x: 100, y: 200 });
      expect(latest(service.textEdit$)).toBe(session);
      session?.confirm('typed');
      await flush();
      expect(service.textEdit()).toBeNull();
      expect(latest(service.textEdit$)).toBeNull();
      expect(service.drawings()[0]?.text).toBe('typed');
    });

    it('takes a new note back when the default editor is cancelled', async () => {
      const host = hostOf();
      const service = setup();
      service.attach(host);
      placeNote(host, service);
      service.textEdit()?.cancel();
      await flush();
      expect(service.drawings()).toStrictEqual([]);
      expect(service.textEdit()).toBeNull();
    });

    it('opens the default editor for an existing note on Enter', () => {
      const host = hostOf();
      const service = setup();
      service.attach(host, { store: new DrawingStore([NOTE]) });
      service.select(['t']);
      host.key('Enter');
      expect(service.textEdit()?.request).toMatchObject({ drawingId: 't', text: 'hi' });
    });

    it('uses the editor of the options instead of the default', async () => {
      const requests: TextEditRequest[] = [];
      const host = hostOf();
      const service = setup();
      service.attach(host, { editText: (request) => (requests.push(request), Promise.resolve('custom')) });
      placeNote(host, service);
      await flush();
      expect(requests).toHaveLength(1);
      expect(service.textEdit()).toBeNull();
      expect(service.drawings()[0]?.text).toBe('custom');
    });

    it('leaves the note empty without an editor when editText is false', async () => {
      const host = hostOf();
      const service = setup();
      service.attach(host, { editText: false });
      // Handing `false` on to the core would be an error there (it calls the editor it is given).
      const errors: unknown[] = [];
      service.tools()?.on('error', (error) => errors.push(error));
      placeNote(host, service);
      await flush();
      expect(errors).toStrictEqual([]);
      expect(service.textEdit()).toBeNull();
      expect(service.drawings()[0]?.text).toBe('');
    });

    it('prefers the editor of the host', async () => {
      const host = hostOf({ editText: () => Promise.resolve('from host') });
      const service = setup();
      service.attach(host);
      placeNote(host, service);
      await flush();
      expect(service.textEdit()).toBeNull();
      expect(service.drawings()[0]?.text).toBe('from host');
    });

    it('closes an open editor without applying anything when the host is detached', async () => {
      const host = hostOf();
      const service = setup();
      service.attach(host);
      placeNote(host, service);
      const session = service.textEdit();
      expect(session).not.toBeNull();
      service.detach();
      expect(service.textEdit()).toBeNull();
      session?.confirm('too late');
      await flush();
      expect(service.store.list()[0]?.text).toBe('');
    });
  });

  describe('when it is destroyed', () => {
    it('releases the host and completes every observable', () => {
      const host = hostOf();
      const service = setup();
      service.attach(host, { store: new DrawingStore([NOTE]) });
      const completed: string[] = [];
      const watch = (name: string, source: Observable<unknown>): void => {
        source.subscribe({ complete: () => completed.push(name) });
      };
      watch('tools', service.tools$);
      watch('state', service.state$);
      watch('drawings', service.drawings$);
      watch('textEdit', service.textEdit$);
      TestBed.resetTestingModule();
      expect(host.listenerCount('pointer')).toBe(0);
      expect(host.listenerCount('key')).toBe(0);
      expect(host.listenerCount('viewport')).toBe(0);
      expect(completed).toStrictEqual(['tools', 'state', 'drawings', 'textEdit']);
    });

    it('stops following the store, and an open editor is closed without applying anything', async () => {
      const host = hostOf();
      const service = setup();
      const store = new DrawingStore();
      service.attach(host, { store });
      placeNote(host, service);
      const session = service.textEdit();
      const before = service.drawings();
      TestBed.resetTestingModule();
      store.add(LINE);
      expect(service.drawings()).toBe(before);
      session?.confirm('too late');
      await flush();
      expect(store.list()[0]?.text).toBe('');
    });

    it('goes with the component it is provided on', () => {
      @Component({ template: '', providers: [KeystoneDrawingToolsService] })
      class ChartHost {
        readonly tools = inject(KeystoneDrawingToolsService);
      }
      const host = hostOf();
      const fixture = TestBed.createComponent(ChartHost);
      fixture.componentInstance.tools.attach(host);
      expect(host.listenerCount('pointer')).toBe(1);
      fixture.destroy();
      expect(host.listenerCount('pointer')).toBe(0);
    });
  });

  describe.each([
    ['with zone.js', [] as (Provider | EnvironmentProviders)[]],
    ['zoneless', [provideZonelessChangeDetection()] as (Provider | EnvironmentProviders)[]],
  ])('in a component, %s', (_name, providers) => {
    @Component({ template: '{{ tools.state().selection.length }}|{{ tools.drawings().length }}|{{ tools.state().canUndo }}', providers: [KeystoneDrawingToolsService] })
    class Counter {
      readonly tools = inject(KeystoneDrawingToolsService);
    }

    async function refresh(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }): Promise<void> {
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it('renders the signals and follows the controller', async () => {
      TestBed.configureTestingModule({ providers });
      const fixture = TestBed.createComponent(Counter);
      await refresh(fixture);
      expect(fixture.nativeElement.textContent).toBe('0|0|false');
      const { tools } = fixture.componentInstance;
      tools.attach(hostOf(), { store: new DrawingStore([NOTE]) });
      tools.select(['t']);
      await refresh(fixture);
      expect(fixture.nativeElement.textContent).toBe('1|1|false');
      tools.remove(['t']);
      await refresh(fixture);
      expect(fixture.nativeElement.textContent).toBe('0|0|true');
    });
  });
});
