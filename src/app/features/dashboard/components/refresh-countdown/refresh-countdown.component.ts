import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { fromEvent, interval, merge, of } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';

import { CACHE_TTL_MS } from 'app/core/constants/refresh.constants';
import { selectLastUpdated, selectLoading } from 'app/store/watchlist/watchlist.selectors';

@Component({
  selector: 'bc-refresh-countdown',
  standalone: true,
  templateUrl: './refresh-countdown.component.html',
  styleUrl: './refresh-countdown.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RefreshCountdownComponent {
  private readonly store     = inject(Store);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly TOTAL_SECS = CACHE_TTL_MS / 1000;

  readonly CIRCUMFERENCE = 2 * Math.PI * 8;

  readonly loading = toSignal(this.store.select(selectLoading), { initialValue: false });

  /**
   * Countdown derivado diretamente do NgRx Store.
   * switchMap: cada mudança em lastUpdated cancela o timer anterior e inicia um novo,
   * garantindo que o countdown sempre reflita o timestamp real do cache.
   * visibilitychange: ao voltar para a aba, recalcula instantaneamente sem esperar 1s.
   */
  readonly countdown = toSignal(
    this.isBrowser
      ? this.store.select(selectLastUpdated).pipe(
          switchMap(lu =>
            merge(
              interval(1000),
              fromEvent(document, 'visibilitychange'),
            ).pipe(
              startWith(0),
              map(() => {
                if (!lu) return 0;
                return Math.max(0, Math.ceil((CACHE_TTL_MS - (Date.now() - lu)) / 1000));
              }),
            ),
          ),
        )
      : of(this.TOTAL_SECS),
    { initialValue: this.TOTAL_SECS },
  );

  readonly dashOffset = computed(
    () => this.CIRCUMFERENCE * (1 - this.countdown() / this.TOTAL_SECS),
  );

  readonly isUrgent = computed(() => this.countdown() <= 5 && !this.loading());

  readonly countdownDisplay = computed(() => {
    const s = this.countdown();
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  });
}
