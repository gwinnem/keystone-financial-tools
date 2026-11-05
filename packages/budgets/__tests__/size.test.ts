import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SIZE_BUDGETS, type SizeBudget } from '../src/budgets.ts';
import { checkSize, minGzipSize } from '../src/size.ts';
import { hex } from './support.ts';

const MODULE = `
// A comment that is not part of the size.
import { helper } from 'some-package';

/** So is this one. */
export function compute(firstValue, secondValue) {
  const intermediateResult = helper(firstValue) + helper(secondValue);
  return intermediateResult * 2;
}
`;

describe('minGzipSize: the min+gzip size of NFR-SIZE-001 (E09-F02-S02)', () => {
  it('is the size of the minified code after gzip, in bytes', async () => {
    const size = await minGzipSize(MODULE);
    expect(Number.isInteger(size)).toBe(true);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(gzipSync(Buffer.from(MODULE), { level: 9 }).length);
  });

  it('does not count comments or white space', async () => {
    const bare = "import{helper}from'some-package';export function compute(firstValue,secondValue){const intermediateResult=helper(firstValue)+helper(secondValue);return intermediateResult*2}";
    expect(await minGzipSize(MODULE)).toBe(await minGzipSize(bare));
  });

  it('does not count license comments either', async () => {
    const licenses = `/*! ${hex(2000)} */\n/** @license ${hex(2000)} */\n`;
    expect(await minGzipSize(licenses + MODULE)).toBe(await minGzipSize(MODULE));
  });

  it('does not count the length of local and top-level names', async () => {
    const long =
      'const aVeryLongTopLevelName = Date.now();\nexport function f() {\n  const aVeryLongLocalName = Math.random();\n  return aVeryLongLocalName + aVeryLongTopLevelName + aVeryLongTopLevelName;\n}\n';
    const short = 'const a = Date.now();\nexport function f() {\n  const b = Math.random();\n  return b + a + a;\n}\n';
    expect(await minGzipSize(long)).toBe(await minGzipSize(short));
  });

  it('keeps the exported names and the imports, which the importing package needs', async () => {
    const withImport = await minGzipSize(`import { alpha, beta, gamma } from 'a-package-with-a-long-name';\nexport const answer = alpha(beta(gamma(42)));\n`);
    const withoutImport = await minGzipSize('export const answer = 42;\n');
    expect(withImport).toBeGreaterThan(withoutImport);
  });

  it('counts incompressible code at about its length', async () => {
    const size = await minGzipSize(`export const data = '${hex(8000)}';\n`);
    expect(size).toBeGreaterThan(3900);
    expect(size).toBeLessThan(4400);
  });

  it('measures the same code the same every time', async () => {
    expect(await minGzipSize(MODULE)).toBe(await minGzipSize(MODULE));
  });

  it('rejects code terser cannot parse', async () => {
    await expect(minGzipSize('export const = ;')).rejects.toThrow();
  });
});

describe('checkSize', () => {
  const budget: SizeBudget = { id: 'vue', file: 'packages/vue/dist/index.js', maxBytes: 3000 };

  it('passes a size below the budget and a size equal to it', () => {
    expect(checkSize(budget, 2999)).toBeUndefined();
    expect(checkSize(budget, 3000)).toBeUndefined();
  });

  it('fails a size above the budget and says by how much it is over', () => {
    expect(checkSize(budget, 3001)).toStrictEqual({ kind: 'over-size', message: 'vue: packages/vue/dist/index.js is 3.00 kB min+gzip, over the budget of 3.00 kB.' });
    expect(checkSize(budget, 3456)).toStrictEqual({ kind: 'over-size', message: 'vue: packages/vue/dist/index.js is 3.46 kB min+gzip, over the budget of 3.00 kB.' });
  });

  it('checks the core against 25 kB and each other package against 3 kB', () => {
    const [core, ...others] = SIZE_BUDGETS;
    expect(checkSize(core, 25_000)).toBeUndefined();
    expect(checkSize(core, 25_001)).toBeDefined();
    for (const other of others) {
      expect(checkSize(other, 3000)).toBeUndefined();
      expect(checkSize(other, 3001)).toBeDefined();
    }
  });
});
