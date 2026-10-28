import { describe, expect, it } from 'vitest';
import { applyCommand, composeCommands, createCommand, invertCommand, type DrawingCommand } from '../src/commands';
import { DrawingStore } from '../src/store';
import type { Drawing, StoreChange } from '../src/types';
import { horizontalLine, trendLine } from './fixtures';
import { randomChange, seeded } from './random';

/** Runs `action` and returns the command for the change it made (null when nothing changed). */
function commandOf(store: DrawingStore, action: () => void): DrawingCommand | null {
  const before = store.list().map((d) => d.id);
  const changes: StoreChange[] = [];
  const stop = store.subscribe((_drawings, next) => changes.push(next));
  action();
  stop();
  expect(changes.length).toBeLessThanOrEqual(1);
  return changes.length === 0 ? null : createCommand(before, changes[0]);
}

const ids = (store: DrawingStore): string[] => store.list().map((d) => d.id);

describe('createCommand', () => {
  it('takes the operations of the change and the id order before and after it', () => {
    const store = new DrawingStore([trendLine('a'), trendLine('b')]);
    const command = commandOf(store, () =>
      store.batch(() => {
        store.remove('a');
        store.add(horizontalLine('c'));
      })
    );
    expect(command).toEqual({
      operations: [
        { type: 'remove', id: 'a', before: trendLine('a') },
        { type: 'add', id: 'c', after: horizontalLine('c') },
      ],
      before: ['a', 'b'],
      after: ['b', 'c'],
    });
  });

  it('is plain data that survives JSON', () => {
    const store = new DrawingStore([trendLine('a')]);
    const command = commandOf(store, () => store.update('a', { text: 'x', meta: { n: 1 } }));
    expect(JSON.parse(JSON.stringify(command))).toEqual(command);
  });
});

describe('invertCommand', () => {
  it('inverts every operation in reverse order and swaps the id orders', () => {
    const a1 = { ...trendLine('a'), text: 'x' };
    const command: DrawingCommand = {
      operations: [
        { type: 'add', id: 'c', after: horizontalLine('c') },
        { type: 'update', id: 'a', before: trendLine('a'), after: a1 },
        { type: 'remove', id: 'b', before: trendLine('b') },
      ],
      before: ['a', 'b'],
      after: ['a', 'c'],
    };
    expect(invertCommand(command)).toEqual({
      operations: [
        { type: 'add', id: 'b', after: trendLine('b') },
        { type: 'update', id: 'a', before: a1, after: trendLine('a') },
        { type: 'remove', id: 'c', before: horizontalLine('c') },
      ],
      before: ['a', 'c'],
      after: ['a', 'b'],
    });
    expect(command.operations[0].type).toBe('add');
  });
});

describe('composeCommands', () => {
  it('folds the operations and spans from the first before to the second after', () => {
    const store = new DrawingStore([trendLine('a')]);
    const first = commandOf(store, () => store.add(trendLine('b'))) as DrawingCommand;
    const second = commandOf(store, () => store.update('b', { text: 'x' })) as DrawingCommand;
    expect(composeCommands(first, second)).toEqual({ operations: [{ type: 'add', id: 'b', after: { ...trendLine('b'), text: 'x' } }], before: ['a'], after: ['a', 'b'] });
  });
});

describe('applyCommand', () => {
  it('undoes and redoes a change exactly, as one store change each', () => {
    const store = new DrawingStore([trendLine('a'), trendLine('b'), trendLine('c')]);
    const before = store.list();
    const command = commandOf(store, () =>
      store.batch(() => {
        store.remove('a');
        store.add({ ...trendLine('a'), text: 'moved to the end' });
        store.update('b', { text: 'x' });
      })
    ) as DrawingCommand;
    const after = store.list();
    expect(ids(store)).toEqual(['b', 'c', 'a']);

    let notifications = 0;
    store.subscribe(() => notifications++);
    expect(applyCommand(store, invertCommand(command))).toBeNull();
    expect(store.list()).toEqual(before);
    expect(applyCommand(store, command)).toBeNull();
    expect(store.list()).toEqual(after);
    expect(notifications).toBe(2);
  });

  it('refuses, changing nothing, when a drawing to update or remove is gone', () => {
    const store = new DrawingStore([trendLine('a'), trendLine('b')]);
    const command = commandOf(store, () => store.update('b', { text: 'x' })) as DrawingCommand;
    store.remove('b');
    const before = store.list();
    expect(applyCommand(store, invertCommand(command))).toEqual({ code: 'KFT-E-MISSING', message: 'Drawing b no longer exists.' });
    expect(store.list()).toBe(before);

    const removal = commandOf(store, () => store.remove('a')) as DrawingCommand;
    store.add(trendLine('a'));
    expect(applyCommand(store, invertCommand(removal))).toEqual({ code: 'KFT-E-ID', message: 'Drawing a already exists.' });
    store.remove('a');
    expect(applyCommand(store, removal)).toEqual({ code: 'KFT-E-MISSING', message: 'Drawing a no longer exists.' });
  });

  it('keeps drawings added outside the command after the listed ones, and skips listed ones that are gone', () => {
    const store = new DrawingStore([trendLine('a'), trendLine('b')]);
    const command = commandOf(store, () => store.update('a', { text: 'x' })) as DrawingCommand;
    store.remove('b');
    store.add(horizontalLine('z'));
    expect(applyCommand(store, invertCommand(command))).toBeNull();
    expect(store.list()).toEqual([trendLine('a'), horizontalLine('z')]);
  });

  it('keeps the current value of drawings the command does not touch', () => {
    const store = new DrawingStore([trendLine('a'), trendLine('b')]);
    const command = commandOf(store, () => store.update('a', { text: 'x' })) as DrawingCommand;
    store.update('b', { text: 'changed outside' });
    applyCommand(store, invertCommand(command));
    expect(store.get('b')).toEqual({ ...trendLine('b'), text: 'changed outside' });
  });
});

describe('command property (QA-004): applying a command and then its inverse restores the store exactly', () => {
  it.each([1, 7, 42, 2026, 99991])('holds for 150 random changes (seed %i)', (seed) => {
    const random = seeded(seed);
    let counter = 0;
    const next = (): string => `d${counter++}`;
    const store = new DrawingStore([trendLine(next()), horizontalLine(next()), trendLine(next())]);
    for (let step = 0; step < 150; step++) {
      const before: readonly Drawing[] = store.list();
      const command = commandOf(store, () => randomChange(store, random, next));
      if (command === null) continue;
      const after: readonly Drawing[] = store.list();
      expect(JSON.parse(JSON.stringify(command))).toEqual(command);
      expect(applyCommand(store, invertCommand(command))).toBeNull();
      expect(store.list()).toEqual(before);
      expect(applyCommand(store, command)).toBeNull();
      expect(store.list()).toEqual(after);
    }
  });
});
