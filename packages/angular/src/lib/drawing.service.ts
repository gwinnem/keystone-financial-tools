import { Injectable, type OnDestroy } from '@angular/core';
import { BehaviorSubject, type Observable } from 'rxjs';
import { DrawingStore, type Drawing } from 'keystone-financial-tools-core';

/**
 * Exposes a drawing store as an observable. Starts with an empty store; `attach` switches to
 * another one (for example a store loaded from saved drawings).
 */
@Injectable({ providedIn: 'root' })
export class KeystoneDrawingService implements OnDestroy {
  private readonly subject = new BehaviorSubject<readonly Drawing[]>([]);
  private attached!: DrawingStore;
  private stop!: () => void;

  /** The drawings of the attached store; emits the current list on subscribe. */
  readonly drawings$: Observable<readonly Drawing[]> = this.subject.asObservable();

  constructor() {
    this.follow(new DrawingStore());
  }

  /** The attached store; change drawings through it. */
  get store(): DrawingStore {
    return this.attached;
  }

  /** Stops following the current store and follows `store` instead. */
  attach(store: DrawingStore): void {
    this.stop();
    this.follow(store);
  }

  ngOnDestroy(): void {
    this.stop();
    this.subject.complete();
  }

  private follow(store: DrawingStore): void {
    this.attached = store;
    this.subject.next(store.list());
    this.stop = store.subscribe((drawings) => this.subject.next(drawings));
  }
}
