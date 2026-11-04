import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_MESSAGES } from 'keystone-financial-tools-core';
import { createMockHost } from 'keystone-financial-tools-core/testing';
import { KeystoneDrawingToolsService } from './drawing-tools.service';

// NFR-I18N-001: the texts the service gives for a toolbar and for the note editor.
function setup(): KeystoneDrawingToolsService {
  TestBed.configureTestingModule({ providers: [KeystoneDrawingToolsService] });
  return TestBed.inject(KeystoneDrawingToolsService);
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('KeystoneDrawingToolsService messages', () => {
  it('gives the English texts before a host is attached', () => {
    expect(setup().messages()).toBe(DEFAULT_MESSAGES);
  });

  it('gives the English texts when attach has no messages option', () => {
    const service = setup();
    service.attach(createMockHost());
    expect(service.messages()).toStrictEqual(DEFAULT_MESSAGES);
  });

  it('merges the messages option of attach over the English texts, the table of the controller', () => {
    const service = setup();
    service.attach(createMockHost(), { messages: { 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' } });
    expect(service.messages()).toStrictEqual({ ...DEFAULT_MESSAGES, 'tool.trend-line': 'Trendlinie', 'editor.note': 'Notiztext' });
    expect(service.messages()).toBe(service.tools()?.messages);
  });

  it('gives the label of every toolbar entry through its label key', () => {
    const service = setup();
    service.attach(createMockHost(), { messages: { 'tool.text-note': 'Notiz' } });
    expect(service.toolbar().map((entry) => service.messages()[entry.labelKey])).toStrictEqual([
      'Trend line',
      'Horizontal line',
      'Rectangle',
      'Fibonacci retracement',
      'Fibonacci arcs',
      'Fibonacci fans',
      'Fibonacci time zones',
      'Notiz',
    ]);
  });

  it('takes the texts of the next attach, and the English ones again after detach', () => {
    const service = setup();
    service.attach(createMockHost(), { messages: { 'tool.rectangle': 'Rechteck' } });
    service.attach(createMockHost(), { messages: { 'tool.rectangle': 'Viereck' } });
    expect(service.messages()['tool.rectangle']).toBe('Viereck');
    service.attach(createMockHost());
    expect(service.messages()).toStrictEqual(DEFAULT_MESSAGES);
    service.attach(createMockHost(), { messages: { 'tool.rectangle': 'Rechteck' } });
    service.detach();
    expect(service.messages()).toBe(DEFAULT_MESSAGES);
  });

  it('throws a RangeError for a key that is not a message key, and keeps the English texts', () => {
    const service = setup();
    service.attach(createMockHost(), { messages: { 'tool.rectangle': 'Rechteck' } });
    expect(() => service.attach(createMockHost(), { messages: { 'tool.circle': 'Kreis' } as never })).toThrow(new RangeError('Unknown message key tool.circle.'));
    expect(service.tools()).toBeNull();
    expect(service.messages()).toBe(DEFAULT_MESSAGES);
  });
});
