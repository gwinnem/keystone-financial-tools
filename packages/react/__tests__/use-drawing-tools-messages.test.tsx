import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { DEFAULT_MESSAGES, type DrawingHost } from 'keystone-financial-tools-core';
import { createMockHost } from 'keystone-financial-tools-core/testing';
import { useDrawingTools, type UseDrawingToolsOptions } from '../src/use-drawing-tools';

// NFR-I18N-001: the texts the hook gives for a toolbar and for the note editor.
interface Props {
  readonly host: DrawingHost | null;
  readonly options?: UseDrawingToolsOptions;
}

const render = (host: DrawingHost | null, options?: UseDrawingToolsOptions) => renderHook(({ host, options }: Props) => useDrawingTools(host, options), { initialProps: { host, options } as Props });

afterEach(cleanup);

describe('useDrawingTools messages', () => {
  it('gives the English texts when there is no messages option', () => {
    expect(render(null).result.current.messages).toStrictEqual(DEFAULT_MESSAGES);
  });

  it('gives the merged texts before there is a host, so a toolbar is translated from its first render', () => {
    const { result } = render(null, { messages: { 'tool.rectangle': 'Rechteck' } });
    expect(result.current.tools).toBeNull();
    expect(result.current.messages).toStrictEqual({ ...DEFAULT_MESSAGES, 'tool.rectangle': 'Rechteck' });
    const rectangle = result.current.toolbar.find((entry) => entry.id === 'rectangle');
    expect(rectangle === undefined ? undefined : result.current.messages[rectangle.labelKey]).toBe('Rechteck');
  });

  it('gives the same texts once the controller exists', () => {
    const { result } = render(createMockHost(), { messages: { 'editor.cancel': 'Abbrechen' } });
    expect(result.current.tools).not.toBeNull();
    expect(result.current.tools?.messages).toStrictEqual(result.current.messages);
    expect(result.current.messages['editor.cancel']).toBe('Abbrechen');
  });

  it('reads the option once: the same table for every render, whatever the options are by then', () => {
    const host = createMockHost();
    const { result, rerender } = render(host, { messages: { 'tool.text-note': 'Notiz' } });
    const first = result.current.messages;
    rerender({ host, options: { messages: { 'tool.text-note': 'Anmerkung' } } });
    expect(result.current.messages).toBe(first);
    expect(result.current.messages['tool.text-note']).toBe('Notiz');
  });
});
