import { describe, expect, it, vi } from 'vitest';
import { DrawingError } from '../src/errors';
import type { DrawingIssue } from '../src/types';
import { record, rig } from './controller-rig';

// E11-F04-S01 (FR-TOOL-019, D-11): a tool that needs host features is disabled on a host without them. No tool
// of 1.0 needs one, so the catalog is replaced here: the rectangle needs `volume`, the text note `panes` and `bars`.
vi.mock('../src/catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/catalog')>();
  const TOOL_CATALOG = original.TOOL_CATALOG.map((entry) => {
    if (entry.id === 'rectangle') return { ...entry, requires: ['volume'] as const };
    if (entry.id === 'text-note') return { ...entry, requires: ['panes', 'bars'] as const };
    return entry;
  });
  return { ...original, TOOL_CATALOG };
});

function issuesOf(fn: () => unknown): readonly DrawingIssue[] {
  try {
    fn();
  } catch (error) {
    return (error as DrawingError).issues;
  }
  return [];
}

const enabledOf = (state: { toolbar: readonly { id: string; enabled: boolean }[] }, id: string): boolean | undefined => state.toolbar.find((entry) => entry.id === id)?.enabled;

describe('a version 2 host', () => {
  it('disables the tools that need version 3 features and names what they lack', () => {
    const { tools } = rig({}, { apiVersion: 2 });
    const { toolbar } = tools.getState();
    expect(toolbar.find((entry) => entry.id === 'rectangle')).toMatchObject({ enabled: false, missing: ['volume'] });
    expect(toolbar.find((entry) => entry.id === 'text-note')).toMatchObject({ enabled: false, missing: ['panes', 'bars'] });
    expect(toolbar.filter((entry) => !entry.enabled).map((entry) => entry.id)).toEqual(['rectangle', 'text-note']);
    expect('missing' in (toolbar.find((entry) => entry.id === 'trend-line') as object)).toBe(false);
  });

  it('refuses to activate such a tool with KFT-E-CAPABILITY, after a blocked event, and stays idle', () => {
    const { tools } = rig({}, { apiVersion: 2 });
    const blocked = record(tools, 'blocked');
    const changed = record(tools, 'tool');
    const issues = issuesOf(() => tools.activate('rectangle'));
    expect(issues).toEqual([{ code: 'KFT-E-CAPABILITY', message: 'The tool rectangle needs a host with: volume.' }]);
    expect(blocked).toEqual([{ code: 'KFT-E-CAPABILITY', tool: 'rectangle', missing: ['volume'] }]);
    expect(changed).toEqual([]);
    expect(tools.getState().activeTool).toBeNull();
    expect(issuesOf(() => tools.activate('text-note'))[0]?.message).toBe('The tool text-note needs a host with: panes, bars.');
    expect(blocked).toHaveLength(2);
  });

  it('still activates the tools that need nothing, without a blocked event', () => {
    const { tools } = rig({}, { apiVersion: 2 });
    const blocked = record(tools, 'blocked');
    tools.activate('trend-line');
    expect(tools.getState().activeTool).toBe('trend-line');
    expect(blocked).toEqual([]);
  });

  it('reports KFT-E-KIND, not KFT-E-CAPABILITY, for a tool that is not in the tools option', () => {
    const { tools } = rig({ tools: ['trend-line'] }, { apiVersion: 2 });
    const blocked = record(tools, 'blocked');
    expect(issuesOf(() => tools.activate('rectangle'))[0]?.code).toBe('KFT-E-KIND');
    expect(blocked).toEqual([]);
  });

  it('keeps such a tool disabled when the tools option changes to include it', () => {
    const { tools } = rig({ tools: ['trend-line'] }, { apiVersion: 2 });
    tools.setOptions({ tools: ['trend-line', 'rectangle', 'text-note'] });
    expect(enabledOf(tools.getState(), 'rectangle')).toBe(false);
    expect(enabledOf(tools.getState(), 'text-note')).toBe(false);
    expect(enabledOf(tools.getState(), 'trend-line')).toBe(true);
  });

  it('leaves the shortcut of such a tool to the host, and still handles the others', () => {
    const { host, tools } = rig({}, { apiVersion: 2 });
    expect(host.key('r', { altKey: true, code: 'KeyR' })).toBe(false);
    expect(tools.getState().activeTool).toBeNull();
    expect(host.key('t', { altKey: true, code: 'KeyT' })).toBe(true);
    expect(tools.getState().activeTool).toBe('trend-line');
  });
});

describe('a version 3 host', () => {
  it('serves the tool that needs panes and bars, and not the one that also needs volume, when it has no volumeBetween', () => {
    const { tools } = rig({});
    expect(enabledOf(tools.getState(), 'text-note')).toBe(true);
    expect(enabledOf(tools.getState(), 'rectangle')).toBe(false);
    expect(tools.getState().toolbar.find((entry) => entry.id === 'rectangle')?.missing).toEqual(['volume']);
    const blocked = record(tools, 'blocked');
    tools.activate('text-note');
    expect(tools.getState().activeTool).toBe('text-note');
    expect(blocked).toEqual([]);
    expect(issuesOf(() => tools.activate('rectangle'))[0]?.code).toBe('KFT-E-CAPABILITY');
    expect(blocked).toEqual([{ code: 'KFT-E-CAPABILITY', tool: 'rectangle', missing: ['volume'] }]);
  });

  it('serves every tool when it has volumeBetween too', () => {
    const { host, tools } = rig({}, { volumeBetween: () => 1 });
    expect(tools.getState().toolbar.every((entry) => entry.enabled && !('missing' in entry))).toBe(true);
    tools.activate('rectangle');
    expect(tools.getState().activeTool).toBe('rectangle');
    tools.deactivate();
    expect(host.key('r', { altKey: true, code: 'KeyR' })).toBe(true);
    expect(tools.getState().activeTool).toBe('rectangle');
  });
});
