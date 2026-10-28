import { describe, expect, it } from 'vitest';
import { DrawingError } from '../src/errors';

describe('DrawingError', () => {
  it('carries the issues and joins them into the message', () => {
    const issues = [
      { code: 'KFT-E-ID', message: 'Bad id.' },
      { code: 'KFT-E-TEXT', message: 'Bad text.' },
    ] as const;
    const error = new DrawingError(issues);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DrawingError');
    expect(error.issues).toBe(issues);
    expect(error.message).toBe('KFT-E-ID: Bad id. KFT-E-TEXT: Bad text.');
  });
});
