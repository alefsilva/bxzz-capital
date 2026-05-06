import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { interval, Observable, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

import { CoinGeckoService } from '../../core/services/coin-gecko.service';
import type { CoinMarket } from '../../core/interfaces/coin.interface';
import { loadPrices, loadPricesFailure, loadPricesSuccess } from './watchlist.actions';
import type { Action } from '@ngrx/store';

@Injectable()
export class WatchlistEffects {
  private readonly actions$     = inject(Actions);
  private readonly coinGeckoSvc = inject(CoinGeckoService);

  private readonly CACHE_KEY    = 'bxzz_coins_cache';
  private readonly CACHE_TS_KEY = 'bxzz_coins_cache_ts';
  /** TTL do cache e intervalo de auto-refresh compartilham o mesmo valor */
  private readonly CACHE_TTL_MS = 60_000;

  /**
   * Cache-first: serve dados do LocalStorage se o cache for < CACHE_TTL_MS.
   * Evita 429 no plano gratuito da CoinGecko (5–15 req/min).
   * switchMap cancela a requisição anterior se uma nova ação chegar antes
   * do response — evita race conditions com dados de mercado voláteis.
   */
  loadPrices$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadPrices),
      switchMap(() => {
        const cached = this.readCache();

        if (cached) {
          console.info('BXZZ-Capital: Carregando dados do cache para poupar a API (Rate Limit Protection)');
          return of(loadPricesSuccess({ coins: cached }));
        }

        return this.fetchFromApi();
      }),
    ),
  );

  /**
   * Auto-refresh a cada CACHE_TTL_MS.
   * startWith(0) foi removido intencionalmente: ngOnInit já faz a carga inicial,
   * evitando o double dispatch que exibia o log de cache antes de qualquer dado existir.
   */
  autoRefresh$ = createEffect(() =>
    interval(this.CACHE_TTL_MS).pipe(
      map(() => loadPrices()),
    ),
  );

  private fetchFromApi(): Observable<Action> {
    return this.coinGeckoSvc.getMarketPrices().pipe(
      tap((coins) => this.writeCache(coins)),
      map((coins) => loadPricesSuccess({ coins })),
      catchError((err) => {
        if (err?.status === 429) {
          const stale = this.readStaleCache();
          if (stale) {
            console.info('BXZZ-Capital: Erro 429 — recuperando último cache disponível.');
            return of(loadPricesSuccess({ coins: stale }));
          }
        }
        return of(loadPricesFailure({ error: err?.message ?? 'Falha ao buscar preços.' }));
      }),
    );
  }

  /** Retorna o cache somente se ainda estiver dentro do TTL */
  private readCache(): CoinMarket[] | null {
    const ts = Number(localStorage.getItem(this.CACHE_TS_KEY) ?? 0);
    if (Date.now() - ts >= this.CACHE_TTL_MS) return null;
    return this.parseCache();
  }

  /** Retorna o cache independente do TTL — usado como fallback em erros 429 */
  private readStaleCache(): CoinMarket[] | null {
    return this.parseCache();
  }

  private parseCache(): CoinMarket[] | null {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      return raw ? (JSON.parse(raw) as CoinMarket[]) : null;
    } catch {
      return null;
    }
  }

  private writeCache(coins: CoinMarket[]): void {
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(coins));
    localStorage.setItem(this.CACHE_TS_KEY, Date.now().toString());
  }
}
