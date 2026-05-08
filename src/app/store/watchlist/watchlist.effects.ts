import { inject, Injectable, PLATFORM_ID, afterNextRender } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { interval, Observable, of, Subject } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';

import { CoinGeckoService } from '../../core/services/coin-gecko.service';
import type { CoinMarket } from '../../core/interfaces/coin.interface';
import { loadPrices, loadPricesFailure, loadPricesSuccess } from './watchlist.actions';
import type { Action } from '@ngrx/store';

@Injectable()
export class WatchlistEffects {
  private readonly actions$     = inject(Actions);
  private readonly coinGeckoSvc = inject(CoinGeckoService);
  private readonly platformId   = inject(PLATFORM_ID);

  private readonly CACHE_KEY    = 'bxzz_coins_cache';
  private readonly CACHE_TS_KEY = 'bxzz_coins_cache_ts';
  /** TTL do cache e intervalo de auto-refresh compartilham o mesmo valor */
  private readonly CACHE_TTL_MS = 60_000;

  /**
   * Subject disparado por afterNextRender — nunca emite em Node.js (no-op),
   * garantindo que interval() não seja criado durante o SSG e não impeça whenStable().
   */
  private readonly renderReady$ = new Subject<void>();

  constructor() {
    afterNextRender(() => this.renderReady$.next());
  }

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
   * Aguarda o primeiro render do browser via renderReady$ — em Node.js
   * afterNextRender é no-op, então o interval nunca é criado durante SSG.
   */
  autoRefresh$ = createEffect(() =>
    this.renderReady$.pipe(
      take(1),
      switchMap(() => interval(this.CACHE_TTL_MS)),
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
    if (!isPlatformBrowser(this.platformId)) return null;
    const ts = Number(localStorage.getItem(this.CACHE_TS_KEY) ?? 0);
    if (Date.now() - ts >= this.CACHE_TTL_MS) return null;
    return this.parseCache();
  }

  /** Retorna o cache independente do TTL — usado como fallback em erros 429 */
  private readStaleCache(): CoinMarket[] | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return this.parseCache();
  }

  private parseCache(): CoinMarket[] | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      return raw ? (JSON.parse(raw) as CoinMarket[]) : null;
    } catch {
      return null;
    }
  }

  private writeCache(coins: CoinMarket[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(coins));
    localStorage.setItem(this.CACHE_TS_KEY, Date.now().toString());
  }
}
