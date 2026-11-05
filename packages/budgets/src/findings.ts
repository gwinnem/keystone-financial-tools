/** What a check found wrong. */
export type FindingKind = 'over-budget' | 'no-benchmark' | 'regression' | 'missing' | 'over-size';

/** One failure of a budget or baseline check; any finding fails the run. */
export interface Finding {
  readonly kind: FindingKind;
  /** One line that says what is wrong and, where there is one, the limit. */
  readonly message: string;
}

/** A time in milliseconds as the reports show it. */
export function formatMs(milliseconds: number): string {
  return milliseconds.toFixed(4);
}

/** A size in kB (1000 bytes) as the reports show it. */
export function formatKb(bytes: number): string {
  return (bytes / 1000).toFixed(2);
}
