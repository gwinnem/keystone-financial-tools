import { describe, expect, it } from 'vitest';
import { reduceInteraction } from '../src/interaction/machine';
import type { InteractionContext, InteractionInput, InteractionState } from '../src/interaction/types';

const ctx: InteractionContext = { lookup: (id) => (id === 'note' ? { kind: 'text-note', locked: false } : id === 'gone' ? undefined : { kind: 'trend-line', locked: false }) };
const step = (state: InteractionState, input: InteractionInput) => reduceInteraction(state, input, ctx);
const placing = (tool: 'text-note' | 'horizontal-line' | 'trend-line'): InteractionState => ({ type: 'placing', tool });

describe('placement-complete (FR-INT-013, FR-INT-050)', () => {
  it.each([
    ['without edit', undefined],
    ['with edit false', false],
  ])('%s selects the new drawing, or stays in the tool', (_name, edit) => {
    const base = { type: 'placement-complete', id: 'n1' } as const;
    const withEdit = (stay: boolean): InteractionInput => (edit === undefined ? { ...base, stay } : { ...base, stay, edit });
    expect(step(placing('horizontal-line'), withEdit(false))).toEqual({ state: { type: 'selected', ids: ['n1'], hover: null }, effects: [], ignored: false });
    const stay = step(placing('horizontal-line'), withEdit(true));
    expect(stay).toEqual({ state: placing('horizontal-line'), effects: [], ignored: false });
  });

  it('opens the text editor for a note and selects it afterwards', () => {
    const result = step(placing('text-note'), { type: 'placement-complete', id: 'note', stay: false, edit: true });
    expect(result).toEqual({ state: { type: 'editing-text', drawingId: 'note' }, effects: [{ type: 'edit-text', drawingId: 'note' }], ignored: false });
    expect(result.state).not.toHaveProperty('resume');
  });

  it('opens the text editor for a note and remembers the tool when staying in it', () => {
    expect(step(placing('text-note'), { type: 'placement-complete', id: 'note', stay: true, edit: true })).toEqual({
      state: { type: 'editing-text', drawingId: 'note', resume: 'text-note' },
      effects: [{ type: 'edit-text', drawingId: 'note' }],
      ignored: false,
    });
  });
});

describe('editing a note placed with stayInTool', () => {
  const editing: InteractionState = { type: 'editing-text', drawingId: 'note', resume: 'text-note' };

  it('returns to the tool with the new text', () => {
    expect(step(editing, { type: 'edit-result', text: 'hello' })).toEqual({
      state: placing('text-note'),
      effects: [{ type: 'apply-text', drawingId: 'note', text: 'hello' }],
      ignored: false,
    });
  });

  it('returns to the tool when the editor is cancelled', () => {
    expect(step(editing, { type: 'edit-result', text: null })).toEqual({ state: placing('text-note'), effects: [], ignored: false });
  });

  it('returns to the tool when the note is deleted meanwhile, and keeps editing while it exists', () => {
    const gone: InteractionState = { type: 'editing-text', drawingId: 'gone', resume: 'text-note' };
    expect(step(gone, { type: 'sync' })).toEqual({ state: placing('text-note'), effects: [], ignored: false });
    expect(step(editing, { type: 'sync' }).state).toBe(editing);
  });

  it('still selects the note, or goes idle, when no tool is remembered', () => {
    const plain: InteractionState = { type: 'editing-text', drawingId: 'note' };
    expect(step(plain, { type: 'edit-result', text: 'x' }).state).toEqual({ type: 'selected', ids: ['note'], hover: null });
    expect(step({ type: 'editing-text', drawingId: 'gone' }, { type: 'sync' }).state).toEqual({ type: 'idle', hover: null });
  });

  it('ignores pointer input and Escape while editing', () => {
    for (const input of [{ type: 'key', key: 'Escape' }, { type: 'deactivate' }, { type: 'click', button: 2, shiftKey: false, target: null }] as const) {
      const result = step(editing, input);
      expect(result.ignored).toBe(true);
      expect(result.state).toBe(editing);
    }
  });
});
