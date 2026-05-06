import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { interval, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { CoinGeckoService } from '../../core/services/coin-gecko.service';
import { loadPrices, loadPricesFailure, loadPricesSuccess } from './watchlist.actions';

@Injectable()
export class WatchlistEffects {
  private readonly actions$       = inject(Actions);
  private readonly coinGeckoSvc   = inject(CoinGeckoService);

  /**
   * Dispara a cada 60s automaticamente + na ação loadPrices manual.
   * switchMap cancela a requisição anterior se uma nova ação chegar antes
   * do response — evita race conditions com dados de mercado voláteis.
   */
  loadPrices$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadPrices),
      switchMap(() =>
        this.coinGeckoSvc.getMarketPrices().pipe(
          map((coins) => loadPricesSuccess({ coins })),
          catchError((err) =>
            of(loadPricesFailure({ error: err?.message ?? 'Falha ao buscar preços.' })),
          ),
        ),
      ),
    ),
  );

  /** Auto-refresh a cada 60 segundos */
  autoRefresh$ = createEffect(() =>
    interval(60_000).pipe(
      startWith(0),
      map(() => loadPrices()),
    ),
  );
}
