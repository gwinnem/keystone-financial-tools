import type { DrawingIssue } from './types';

/** Thrown when a drawing or a saved document is invalid. `issues` says what is wrong. */
export class DrawingError extends Error {
  readonly issues: readonly DrawingIssue[];

  constructor(issues: readonly DrawingIssue[]) {
    super(issues.map((i) => `${i.code}: ${i.message}`).join(' '));
    this.name = 'DrawingError';
    this.issues = issues;
  }
}
