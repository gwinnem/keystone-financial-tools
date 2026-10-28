import { ANCHOR_COUNT, isDrawingKind } from './kinds';
import { isPlainObject } from './object';
import { validateOptions } from './options';
import { validateStyle } from './style';
import type { Anchor, DrawingIssue, DrawingIssueCode } from './types';

function issue(code: DrawingIssueCode, message: string): DrawingIssue {
  return { code, message };
}

/**
 * True for an anchor with a finite time and price and a non-empty y-axis id.
 *
 * @example
 * ```ts
 * isValidAnchor({ time: Date.UTC(2026, 9, 28), price: 101.5, yAxisId: 'price' }); // true
 * isValidAnchor({ time: Number.NaN, price: 1, yAxisId: 'price' }); // false
 * ```
 */
export function isValidAnchor(value: unknown): value is Anchor {
  if (value === null || value === undefined) return false;
  const a = value as Record<string, unknown>;
  return Number.isFinite(a.time) && Number.isFinite(a.price) && typeof a.yAxisId === 'string' && a.yAxisId !== '';
}

/**
 * The path of the first value under `value` that does not survive a JSON round trip unchanged, or
 * null when everything does. `ancestors` holds the values on the current path, so a cycle is found
 * while a value shared by two siblings is not mistaken for one. Anything that is not null, a string,
 * a boolean, a finite number, an array or a plain object (`undefined`, functions, symbols, bigints,
 * dates, class instances) is unsafe: it ends in the `isPlainObject` check below.
 */
function unsafeJsonPath(value: unknown, path: string, ancestors: Set<unknown>): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (ancestors.has(value)) return path;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        const found = unsafeJsonPath(value[index], `${path}[${index}]`, ancestors);
        if (found !== null) return found;
      }
      return null;
    }
    if (!isPlainObject(value)) return path;
    for (const [key, item] of Object.entries(value)) {
      const found = unsafeJsonPath(item, `${path}.${key}`, ancestors);
      if (found !== null) return found;
    }
    return null;
  } finally {
    ancestors.delete(value);
  }
}

function validateMeta(meta: unknown): DrawingIssue | null {
  if (!isPlainObject(meta)) return issue('KFT-E-META', 'The meta must be a plain object.');
  const path = unsafeJsonPath(meta, 'meta', new Set());
  return path === null ? null : issue('KFT-E-META', `The value at ${path} is not JSON-safe.`);
}

/**
 * Lists what is wrong with a drawing; an empty list means it is valid. Never throws. Issues come
 * in a stable order: id, kind, anchors, axis, text, style, options, locked, hidden, zIndex, meta.
 * Options are checked only when the kind is known.
 *
 * @example
 * ```ts
 * const issues = validateDrawing(input);
 * if (issues.length > 0) console.warn(issues.map((i) => i.code)); // for example ['KFT-E-AXIS']
 * ```
 */
export function validateDrawing(value: unknown): DrawingIssue[] {
  if (value === null || typeof value !== 'object') {
    return [issue('KFT-E-SHAPE', 'A drawing must be an object.')];
  }
  const d = value as Record<string, unknown>;
  const issues: DrawingIssue[] = [];
  if (typeof d.id !== 'string' || d.id === '') {
    issues.push(issue('KFT-E-ID', 'The id must be a non-empty string.'));
  }
  if (!isDrawingKind(d.kind)) {
    issues.push(issue('KFT-E-KIND', `Unknown drawing kind: ${String(d.kind)}.`));
  } else if (!Array.isArray(d.anchors) || d.anchors.length !== ANCHOR_COUNT[d.kind]) {
    issues.push(issue('KFT-E-ANCHORS', `A ${d.kind} needs ${ANCHOR_COUNT[d.kind]} anchor(s).`));
  } else {
    d.anchors.forEach((anchor: unknown, index: number) => {
      if (!isValidAnchor(anchor)) {
        issues.push(issue('KFT-E-ANCHOR', `Anchor ${index} needs a finite time and price and a non-empty y-axis id.`));
      }
    });
    const axes = new Set((d.anchors as unknown[]).filter(isValidAnchor).map((anchor) => anchor.yAxisId));
    if (axes.size > 1) {
      issues.push(issue('KFT-E-AXIS', 'All anchors of a drawing must be on the same y-axis.'));
    }
  }
  if (d.text !== undefined && typeof d.text !== 'string') {
    issues.push(issue('KFT-E-TEXT', 'The text must be a string.'));
  }
  if (d.style !== undefined) issues.push(...validateStyle(d.style));
  if (d.options !== undefined && isDrawingKind(d.kind)) issues.push(...validateOptions(d.kind, d.options));
  if (d.locked !== undefined && typeof d.locked !== 'boolean') {
    issues.push(issue('KFT-E-SHAPE', 'The locked flag must be a boolean.'));
  }
  if (d.hidden !== undefined && typeof d.hidden !== 'boolean') {
    issues.push(issue('KFT-E-SHAPE', 'The hidden flag must be a boolean.'));
  }
  if (d.zIndex !== undefined && !Number.isInteger(d.zIndex)) {
    issues.push(issue('KFT-E-SHAPE', 'The zIndex must be a finite integer.'));
  }
  if (d.meta !== undefined) {
    const metaIssue = validateMeta(d.meta);
    if (metaIssue !== null) issues.push(metaIssue);
  }
  return issues;
}
