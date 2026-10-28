import { describe, expect, it } from 'vitest';
import v1Basic from '../__fixtures__/documents/v1-basic.json';
import v2Basic from '../__fixtures__/documents/v2-basic.json';
import { DrawingError } from '../src/errors';
import { DOCUMENT_VERSION, migrateV1ToV2, readDocument, SUPPORTED_DOCUMENT_VERSIONS } from '../src/migrations';
import type { DrawingDocumentV1 } from '../src/types';
import { deepFreeze } from '../src/object';
import { trendLine } from './fixtures';

const UNREADABLE = [{ code: 'KFT-E-JSON', message: 'Expected a drawing document of version 1 or 2.' }];
const BAD_SCOPE = [{ code: 'KFT-E-JSON', message: 'The document scope must be an object with an optional non-empty symbol and timeframe, and nothing else.' }];

function issuesOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DrawingError);
    return (error as DrawingError).issues;
  }
  throw new Error('Expected a DrawingError');
}

describe('document versions', () => {
  it('writes version 2 and reads versions 1 and 2', () => {
    expect(DOCUMENT_VERSION).toBe(2);
    expect(SUPPORTED_DOCUMENT_VERSIONS).toEqual([1, 2]);
    expect(Object.isFrozen(SUPPORTED_DOCUMENT_VERSIONS)).toBe(true);
  });
});

describe('migrateV1ToV2', () => {
  it('turns a version 1 document into version 2 without touching the input', () => {
    const v1 = deepFreeze<DrawingDocumentV1>({ version: 1, drawings: [trendLine('a')] });
    const v2 = migrateV1ToV2(v1);
    expect(v2).toEqual({ version: 2, drawings: [trendLine('a')] });
    expect(v2).not.toBe(v1);
    expect(v1.version).toBe(1);
  });

  it('migrates the real version 1 fixture to the expected version 2 document', () => {
    expect(migrateV1ToV2(v1Basic as DrawingDocumentV1)).toEqual(v2Basic);
  });
});

describe('readDocument', () => {
  it('returns a version 2 document as it is', () => {
    expect(readDocument(v2Basic)).toEqual(v2Basic);
    const scoped = { version: 2, scope: { symbol: 'EURUSD', timeframe: '1h' }, drawings: [] };
    expect(readDocument(scoped)).toEqual(scoped);
  });

  it('migrates a version 1 document', () => {
    expect(readDocument(v1Basic)).toEqual(v2Basic);
  });

  it('ignores a scope on a version 1 document (version 1 had none)', () => {
    expect(readDocument({ version: 1, scope: 'junk', drawings: [] })).toEqual({ version: 2, drawings: [] });
  });

  it('does not validate the drawings themselves', () => {
    expect(readDocument({ version: 2, drawings: [1, null] })).toEqual({ version: 2, drawings: [1, null] });
  });

  it('rejects values that are not documents of a supported version, naming the versions', () => {
    for (const value of [
      null,
      undefined,
      'doc',
      [],
      { drawings: [] },
      { version: 3, drawings: [] },
      { version: 0, drawings: [] },
      { version: '2', drawings: [] },
      { version: 2 },
      { version: 1, drawings: {} },
    ]) {
      expect(issuesOf(() => readDocument(value))).toEqual(UNREADABLE);
    }
  });

  it('accepts a scope with an optional symbol and timeframe', () => {
    for (const scope of [{}, { symbol: 'EURUSD' }, { timeframe: '1h' }, { symbol: 'AAPL', timeframe: '1d' }, { symbol: undefined }]) {
      expect(readDocument({ version: 2, scope, drawings: [] })).toEqual({ version: 2, scope, drawings: [] });
    }
  });

  it('rejects a scope that is not an object or has empty, non-string or unknown values', () => {
    for (const scope of [null, 'EURUSD', [], { symbol: '' }, { symbol: 5 }, { timeframe: '' }, { timeframe: false }, { symbol: 'X', exchange: 'NYSE' }]) {
      expect(issuesOf(() => readDocument({ version: 2, scope, drawings: [] }))).toEqual(BAD_SCOPE);
    }
  });
});
