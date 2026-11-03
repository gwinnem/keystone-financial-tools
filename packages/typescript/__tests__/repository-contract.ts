import { describe, expect, it } from 'vitest';
import type { Drawing, DrawingDocument } from 'keystone-financial-tools-core';
import type { DrawingRepository, DrawingScope } from '../src/repository';

export const line = (id: string): Drawing => ({
  id,
  kind: 'trend-line',
  anchors: [
    { time: 1, price: 10, yAxisId: 'price' },
    { time: 2, price: 11, yAxisId: 'price' },
  ],
});

export const documentOf = (symbol: string, ...drawings: Drawing[]): DrawingDocument => ({ version: 2, scope: { symbol }, drawings });

export const AAPL: DrawingScope = { symbol: 'AAPL' };
export const AAPL_1H: DrawingScope = { symbol: 'AAPL', timeframe: '1h' };

/** What every `DrawingRepository` must do (E06-F02-S01); each implementation runs it with a factory for a new, empty repository. */
export function describeRepositoryContract(name: string, create: () => DrawingRepository): void {
  describe(`${name}: repository contract`, () => {
    it('resolves an empty document, without an issue, when nothing is saved', async () => {
      expect(await create().load(AAPL)).toStrictEqual({ document: { version: 2, drawings: [] } });
    });

    it('loads what was saved', async () => {
      const repository = create();
      const document = documentOf('AAPL', line('a'), line('b'));
      await repository.save(AAPL, document);
      expect(await repository.load(AAPL)).toStrictEqual({ document });
    });

    it('resolves save and remove with undefined', async () => {
      const repository = create();
      expect(await repository.save(AAPL, documentOf('AAPL'))).toBeUndefined();
      expect(await repository.remove(AAPL)).toBeUndefined();
    });

    it('keeps a document without drawings', async () => {
      const repository = create();
      await repository.save(AAPL, documentOf('AAPL'));
      expect((await repository.load(AAPL)).document).toStrictEqual(documentOf('AAPL'));
    });

    it('replaces the document of the scope on every save', async () => {
      const repository = create();
      await repository.save(AAPL, documentOf('AAPL', line('a'), line('b')));
      await repository.save(AAPL, documentOf('AAPL', line('c')));
      expect((await repository.load(AAPL)).document).toStrictEqual(documentOf('AAPL', line('c')));
    });

    it('stores a copy: changing the saved document afterwards changes nothing', async () => {
      const repository = create();
      const document = { version: 2, scope: { symbol: 'AAPL' }, drawings: [line('a')] } as { version: 2; scope: { symbol: string }; drawings: Drawing[] };
      await repository.save(AAPL, document);
      document.drawings.push(line('b'));
      expect((await repository.load(AAPL)).document.drawings).toStrictEqual([line('a')]);
    });

    it('loads a new document each time: changing a loaded one changes nothing', async () => {
      const repository = create();
      await repository.save(AAPL, documentOf('AAPL', line('a')));
      const first = (await repository.load(AAPL)).document as unknown as { drawings: Drawing[] };
      first.drawings.push(line('b'));
      expect((await repository.load(AAPL)).document.drawings).toStrictEqual([line('a')]);
    });

    it('keeps the scopes apart, also symbols and timeframes that need encoding', async () => {
      const repository = create();
      const scopes: DrawingScope[] = [AAPL, AAPL_1H, { symbol: 'BTC/USD' }, { symbol: 'a:b' }, { symbol: 'a', timeframe: 'b' }, { symbol: 'a', timeframe: '' }];
      for (const [index, scope] of scopes.entries()) await repository.save(scope, documentOf(scope.symbol, line(`d${index}`)));
      for (const [index, scope] of scopes.entries()) {
        expect((await repository.load(scope)).document.drawings).toStrictEqual([line(`d${index}`)]);
      }
    });

    it('removes only the document of the scope', async () => {
      const repository = create();
      await repository.save(AAPL, documentOf('AAPL', line('a')));
      await repository.save(AAPL_1H, documentOf('AAPL', line('b')));
      await repository.remove(AAPL);
      expect(await repository.load(AAPL)).toStrictEqual({ document: { version: 2, drawings: [] } });
      expect((await repository.load(AAPL_1H)).document.drawings).toStrictEqual([line('b')]);
    });

    it('resolves when removing a scope that was never saved', async () => {
      await expect(create().remove(AAPL)).resolves.toBeUndefined();
    });

    it('does not validate the drawings: the document comes back as stored, for loadStore and importDocument to report on', async () => {
      const repository = create();
      const document = { version: 2, drawings: [line('a'), { id: 'broken' }] } as unknown as DrawingDocument;
      await repository.save(AAPL, document);
      expect((await repository.load(AAPL)).document).toStrictEqual(document);
    });
  });
}
