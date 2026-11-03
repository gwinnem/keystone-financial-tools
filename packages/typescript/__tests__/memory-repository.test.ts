import { describe, expect, it } from 'vitest';
import { MemoryRepository } from '../src/memory-repository';
import { AAPL, describeRepositoryContract, documentOf, line } from './repository-contract';

describeRepositoryContract('MemoryRepository', () => new MemoryRepository());

describe('MemoryRepository', () => {
  it('keeps separate repositories apart', async () => {
    const first = new MemoryRepository();
    const second = new MemoryRepository();
    await first.save(AAPL, documentOf('AAPL', line('a')));
    expect((await second.load(AAPL)).document.drawings).toStrictEqual([]);
  });

  it('rejects a save that cannot be written as JSON and keeps the previous document', async () => {
    const repository = new MemoryRepository();
    await repository.save(AAPL, documentOf('AAPL', line('a')));
    const circular = { version: 2, drawings: [] } as Record<string, unknown>;
    circular.self = circular;
    await expect(repository.save(AAPL, circular as never)).rejects.toThrow(TypeError);
    expect((await repository.load(AAPL)).document.drawings).toStrictEqual([line('a')]);
  });
});
