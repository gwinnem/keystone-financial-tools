import { signal, type Signal, type WritableSignal } from '@angular/core';
import { BehaviorSubject, type Observable } from 'rxjs';

/**
 * One value that the service offers twice: as a signal and as an observable that emits the current
 * value on subscribe. Both are set together, so they never differ.
 */
export class Channel<T> {
  private readonly subject: BehaviorSubject<T>;
  private readonly source: WritableSignal<T>;
  /** The value as a read-only signal. */
  readonly value: Signal<T>;
  /** The value as an observable; it completes with the channel. */
  readonly changes: Observable<T>;

  constructor(initial: T) {
    this.subject = new BehaviorSubject(initial);
    this.source = signal(initial);
    this.value = this.source.asReadonly();
    this.changes = this.subject.asObservable();
  }

  set(next: T): void {
    this.source.set(next);
    this.subject.next(next);
  }

  complete(): void {
    this.subject.complete();
  }
}
