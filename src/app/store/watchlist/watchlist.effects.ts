import { inject, Injectable, PLATFORM_ID, afterNextRender } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, Observable, Subject, from, of, timer } from 'rxjs';
import {
  catchError,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
  take,
  tap,
  withLatestFrom,
} from 'rxjs/operators';

import { CoinGeckoService } from '@src/app/core/services/coin-gecko.service';
import { TabSyncService } from '@src/app/core/services/tab-sync.service';
import type { CoinMarket } from '@src/app/core/interfaces/coin.interface';
import {
  enterCooldown,
  loadPrices,
  loadPricesFailure,
  loadPricesSuccess,
} from './watchlist.actions';
import { selectLastUpdated } from './watchlist.selectors';
import { CACHE_TTL_MS, COOLDOWN_MS } from '@src/app/core/constants/refresh.constants';
import type { Action } from '@ngrx/store';

@Injectable()
export class WatchlistEffects {
  private readonly actions$     = inject(Actions);
  private readonly coinGeckoSvc = inject(CoinGeckoService);
  private readonly platformId   = inject(PLATFORM_ID);
  private readonly tabSync      = inject(TabSyncService);
  private readonly store        = inject(Store);

  private readonly CACHE_KEY    = 'bxzz_coins_cache';
  private readonly CACHE_TS_KEY = 'bxzz_coins_cache_ts';
  private readonly COOLDOWN_KEY = 'bxzz_cooldown_until';

  /**
   * Subject disparado por afterNextRender — nunca emite em Node.js (no-op durante SSG),
   * garantindo que timers e BroadcastChannel não sejam criados no build.
   */
  private readonly renderReady$ = new Subject<void>();

  constructor() {
    afterNextRender(() => {
      this.tabSync.init();
      this.renderReady$.next();
    });
  }

  /**
   * Cache-first: serve dados do LocalStorage se o cache for < CACHE_TTL_MS (5 min).
   * Apenas a aba Líder chama a API quando o cache não existe ou expirou.
   * As abas Seguidoras aguardam sincronização via broadcastSync$.
   */
  loadPrices$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadPrices),
      switchMap(() => {
        // No-op durante o build SSG — localStorage não existe em Node.js
        if (!isPlatformBrowser(this.platformId)) return EMPTY;

        // 1. Cooldown ativo? Redispacha enterCooldown para manter o banner na UI
        const storedCooldown = Number(localStorage.getItem(this.COOLDOWN_KEY) ?? 0);
        if (storedCooldown > Date.now()) {
          return of(enterCooldown({ cooldownUntil: storedCooldown }));
        }
        // Limpa entrada expirada do localStorage
        if (storedCooldown > 0) localStorage.removeItem(this.COOLDOWN_KEY);

        // 2. Cache válido? Serve local (leader + followers)
        const cached = this.readCache();
        if (cached) {
          const lastUpdated = Number(localStorage.getItem(this.CACHE_TS_KEY) ?? 0);
          console.info('BXZZ-Capital: Carregando dados do cache para poupar a API (Rate Limit Protection)');
          return of(loadPricesSuccess({ coins: cached, lastUpdated }));
        }

        // 3. Sem cache — só o líder faz requisição; follower aguarda broadcastSync$
        if (!this.tabSync.isLeader) return EMPTY;

        return this.fetchFromApi();
      }),
    ),
  );

  /**
   * Dispara loadPrices() exatamente quando o cache expira.
   * Apenas a aba Líder agenda o próximo refresh — evita requisições duplicadas.
   */
  autoRefresh$ = createEffect(() =>
    this.renderReady$.pipe(
      take(1),
      switchMap(() =>
        this.actions$.pipe(
          ofType(loadPricesSuccess),
          filter(() => this.tabSync.isLeader),
          switchMap(({ lastUpdated }) => {
            const expiresIn = Math.max(0, CACHE_TTL_MS - (Date.now() - lastUpdated));
            return timer(expiresIn);
          }),
        ),
      ),
      map(() => loadPrices()),
    ),
  );

  /**
   * Abas Seguidoras recebem atualizações de preço e cooldowns
   * diretamente via BroadcastChannel (sem tocar na API).
   */
  broadcastSync$ = createEffect(() =>
    this.renderReady$.pipe(
      take(1),
      switchMap(() =>
        this.tabSync.messages$.pipe(
          switchMap((msg) => {
            if (msg.type === 'prices-updated' && Array.isArray(msg.coins) && typeof msg.lastUpdated === 'number') {
              return of(loadPricesSuccess({ coins: msg.coins, lastUpdated: msg.lastUpdated }));
            }
            if (msg.type === 'cooldown-started' && typeof msg.cooldownUntil === 'number') {
              return of(enterCooldown({ cooldownUntil: msg.cooldownUntil }));
            }
            return EMPTY;
          }),
        ),
      ),
    ),
  );

  /**
   * Aba Líder transmite preços atualizados para as Seguidoras via BroadcastChannel.
   * BroadcastChannel não entrega mensagens para a própria aba — sem duplicação.
   */
  broadcastPrices$ = createEffect(
    () =>
      this.renderReady$.pipe(
        take(1),
        switchMap(() =>
          this.actions$.pipe(
            ofType(loadPricesSuccess),
            filter(() => this.tabSync.isLeader),
            tap(({ coins, lastUpdated }) => {
              this.tabSync.broadcast({ type: 'prices-updated', coins, lastUpdated });
            }),
          ),
        ),
      ),
    { dispatch: false },
  );

  /**
   * Após o cooldown de 5 min, a aba Líder tenta automaticamente uma nova requisição.
   * Abas Seguidoras ignoram (filter de isLeader após o timer).
   */
  cooldownExpired$ = createEffect(() =>
    this.renderReady$.pipe(
      take(1),
      switchMap(() =>
        this.actions$.pipe(
          ofType(enterCooldown),
          switchMap(({ cooldownUntil }) => {
            const remaining = Math.max(0, cooldownUntil - Date.now());
            return timer(remaining);
          }),
          filter(() => this.tabSync.isLeader),
          map(() => loadPrices()),
        ),
      ),
    ),
  );

  /**
   * Retoma o ciclo de refresh ao assumir liderança — tanto no boot inicial
   * quanto na transição follower→leader (quando a aba líder fecha).
   * Sem skip(1): trata também o cold-start onde isLeader era false no ngOnInit
   * e loadPrices$ retornou EMPTY antes de afterNextRender() completar.
   */
  onBecomeLeader$ = createEffect(() =>
    this.renderReady$.pipe(
      take(1),
      switchMap(() =>
        this.tabSync.isLeader$.pipe(
          distinctUntilChanged(),
          filter((isLeader) => isLeader),
          withLatestFrom(this.store.select(selectLastUpdated)),
          switchMap(([, lastUpdated]) => {
            if (!isPlatformBrowser(this.platformId)) return EMPTY;

            // Se ainda em cooldown, cooldownExpired$ já tem um timer ativo
            const storedCooldown = Number(localStorage.getItem(this.COOLDOWN_KEY) ?? 0);
            if (storedCooldown > Date.now()) return EMPTY;

            if (!lastUpdated) return of(loadPrices());

            const expiresIn = Math.max(0, CACHE_TTL_MS - (Date.now() - lastUpdated));
            if (expiresIn === 0) return of(loadPrices());

            return timer(expiresIn).pipe(map(() => loadPrices()));
          }),
        ),
      ),
    ),
  );

  private fetchFromApi(): Observable<Action> {
    return this.coinGeckoSvc.getMarketPrices().pipe(
      map((coins) => {
        const lastUpdated = Date.now();
        this.writeCache(coins, lastUpdated);
        return loadPricesSuccess({ coins, lastUpdated });
      }),
      catchError((err) => {
        if (err?.status === 429) {
          const cooldownUntil = Date.now() + COOLDOWN_MS;
          localStorage.setItem(this.COOLDOWN_KEY, String(cooldownUntil));
          this.tabSync.broadcast({ type: 'cooldown-started', cooldownUntil });

          const stale  = this.readStaleCache();
          const stalTs = Number(localStorage.getItem(this.CACHE_TS_KEY) ?? Date.now());

          if (stale) {
            return from([
              enterCooldown({ cooldownUntil }),
              loadPricesSuccess({ coins: stale, lastUpdated: stalTs }),
            ]);
          }

          return from([
            enterCooldown({ cooldownUntil }),
            loadPricesFailure({ error: 'Limite de taxa da API atingido. Próxima tentativa automática em 5 minutos.' }),
          ]);
        }

        return of(loadPricesFailure({ error: err?.message ?? 'Falha ao buscar preços.' }));
      }),
    );
  }

  /** Retorna o cache somente se ainda estiver dentro do TTL */
  private readCache(): CoinMarket[] | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    const ts = Number(localStorage.getItem(this.CACHE_TS_KEY) ?? 0);
    if (Date.now() - ts >= CACHE_TTL_MS) return null;
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

  private writeCache(coins: CoinMarket[], ts = Date.now()): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(coins));
    localStorage.setItem(this.CACHE_TS_KEY, ts.toString());
  }
}
