import { gzipSync } from 'node:zlib';
import { minify } from 'terser';
import type { SizeBudget } from './budgets.ts';
import { formatKb, type Finding } from './findings.ts';

/**
 * The minified and gzipped size of an ES module, in bytes: the code goes through terser (module, default compression, no comments, not even
 * license comments) and then through gzip at its default level, which is also what the Vite build reports. Imports stay as they are, so a
 * package that imports the core is measured without it.
 *
 * @example
 * ```ts
 * const bytes = await minGzipSize(await readFile('packages/vue/dist/index.js', 'utf8'));
 * ```
 */
export async function minGzipSize(code: string): Promise<number> {
  const result = await minify(code, { module: true, format: { comments: false } });
  // Without a source map option terser always returns the code.
  return gzipSync(Buffer.from(result.code as string)).length;
}

/**
 * The finding for a file over its size budget, or undefined when it is within the budget (a size equal to the budget is within it).
 *
 * @example
 * ```ts
 * checkSize(SIZE_BUDGETS[0], 26_000)?.message; // 'core: packages/core/dist/index.js is 26.00 kB min+gzip, over the budget of 25.00 kB.'
 * ```
 */
export function checkSize(budget: SizeBudget, bytes: number): Finding | undefined {
  if (bytes <= budget.maxBytes) return undefined;
  return { kind: 'over-size', message: `${budget.id}: ${budget.file} is ${formatKb(bytes)} kB min+gzip, over the budget of ${formatKb(budget.maxBytes)} kB.` };
}
