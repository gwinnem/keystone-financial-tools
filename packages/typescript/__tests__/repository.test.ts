import { describe, expect, it } from 'vitest';
import { REPOSITORY_TIERS, RepositoryError, emptyDocument, parseStored, readStored, repositoryFailure } from '../src/repository';
import { documentOf, line } from './repository-contract';

const NOT_A_DOCUMENT = 'Expected a drawing document of version 1 or 2.';

describe('emptyDocument', () => {
  it('is a version 2 document without drawings, a new object each time', () => {
    expect(emptyDocument()).toStrictEqual({ version: 2, drawings: [] });
    expect(emptyDocument()).not.toBe(emptyDocument());
    expect(emptyDocument().drawings).not.toBe(emptyDocument().drawings);
  });
});

describe('readStored', () => {
  it('is an empty document without an issue when nothing is stored', () => {
    expect(readStored(undefined)).toStrictEqual({ document: { version: 2, drawings: [] } });
  });

  it('returns a version 2 document as it is', () => {
    const document = documentOf('AAPL', line('a'));
    expect(readStored(document)).toStrictEqual({ document });
  });

  it('migrates a version 1 document', () => {
    expect(readStored({ version: 1, drawings: [line('a')] })).toStrictEqual({ document: { version: 2, drawings: [line('a')] } });
  });

  it('keeps drawings that are not valid; they are for loadStore and importDocument to report', () => {
    const document = { version: 2, drawings: [{ id: 'broken' }] };
    expect(readStored(document).document.drawings).toStrictEqual([{ id: 'broken' }]);
  });

  it.each([
    ['null', null],
    ['text', 'drawings'],
    ['an array', []],
    ['a newer version', { version: 3, drawings: [] }],
    ['a missing drawings list', { version: 2 }],
    ['an invalid scope', { version: 2, scope: { symbol: '' }, drawings: [] }],
  ])('is an empty document plus the KFT-E-JSON issue for %s', (_name, value) => {
    const result = readStored(value);
    expect(result.document).toStrictEqual({ version: 2, drawings: [] });
    expect(result.issue?.code).toBe('KFT-E-JSON');
  });

  it('reports why a document could not be read', () => {
    expect(readStored({ version: 3, drawings: [] }).issue).toStrictEqual({ code: 'KFT-E-JSON', message: NOT_A_DOCUMENT });
  });
});

describe('parseStored', () => {
  it('is an empty document without an issue when nothing is stored', () => {
    expect(parseStored(null, 'key')).toStrictEqual({ document: { version: 2, drawings: [] } });
  });

  it('reads stored text', () => {
    const document = documentOf('AAPL', line('a'));
    expect(parseStored(JSON.stringify(document), 'key')).toStrictEqual({ document });
  });

  it('reports text that is not JSON, naming the key', () => {
    expect(parseStored('{oops', 'keystone-drawings:AAPL')).toStrictEqual({
      document: { version: 2, drawings: [] },
      issue: { code: 'KFT-E-JSON', message: 'The drawings saved under keystone-drawings:AAPL are not valid JSON.' },
    });
  });

  it('reports JSON that is not a document', () => {
    expect(parseStored('{"version":9,"drawings":[]}', 'key')).toStrictEqual({ document: { version: 2, drawings: [] }, issue: { code: 'KFT-E-JSON', message: NOT_A_DOCUMENT } });
  });
});

describe('RepositoryError and repositoryFailure', () => {
  it('names the action, the key and the message of the error', () => {
    const reason = new Error('The quota has been exceeded.');
    const error = repositoryFailure('save', 'keystone-drawings:AAPL', reason);
    expect(error).toBeInstanceOf(RepositoryError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('RepositoryError');
    expect(error.message).toBe('Could not save the drawings under keystone-drawings:AAPL: The quota has been exceeded.');
    expect(error.reason).toBe(reason);
  });

  it('describes a thrown value that is not an error with String()', () => {
    expect(repositoryFailure('read', 'k', 'denied').message).toBe('Could not read the drawings under k: denied');
    expect(repositoryFailure('remove', 'k', null).message).toBe('Could not remove the drawings under k: null');
    expect(repositoryFailure('remove', 'k', 'denied').reason).toBe('denied');
  });
});

describe('REPOSITORY_TIERS', () => {
  it('puts Web Storage and memory in Community and IndexedDB in Professional (FR-LIC-002, OD-2)', () => {
    expect(REPOSITORY_TIERS).toStrictEqual({ memory: 'community', 'web-storage': 'community', indexeddb: 'professional' });
    expect(Object.isFrozen(REPOSITORY_TIERS)).toBe(true);
  });
});
