import { TestBed } from '@angular/core/testing';
import { Action } from '@ngrx/store';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { Subject, of, throwError } from 'rxjs';

import { WatchlistEffects } from './watchlist.effects';
import { CoinGeckoService } from '@src/app/core/services/coin-gecko.service';
import { TabSyncService } from '@src/app/core/services/tab-sync.service';
import {
  enterCooldown,
  loadPrices,
  loadPricesFailure,
  loadPricesSuccess,
} from './watchlist.actions';
import { initialWatchlistState } from './watchlist.state';
import type { CoinMarket } from '@src/app/core/interfaces/coin.interface';

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeCoin(overrides: Partial<CoinMarket> = {}): CoinMarket {
  return {
    id:                               'bitcoin',
    symbol:                           'btc',
    name:                             'Bitcoin',
    image:                            'https://example.com/btc.png',
    current_price:                    60000,
    market_cap:                       1_000_000_000,
    market_cap_rank:                  1,
    fully_diluted_valuation:          null,
    total_volume:                     30_000_000,
    high_24h:                         61000,
    low_24h:                          59000,
    price_change_24h:                 500,
    price_change_percentage_24h:      1.0,
    market_cap_change_24h:            0,
    market_cap_change_percentage_24h: 0,
    circulating_supply:               19_000_000,
    total_supply:                     21_000_000,
    max_supply:                       21_000_000,
    ath:                              69000,
    ath_change_percentage:            -27,
    ath_date:                         '2021-11-10',
    atl:                              67.81,
    atl_change_percentage:            73000,
    atl_date:                         '2013-07-06',
    last_updated:                     '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CACHE_KEY     = 'bxzz_coins_cache';
const CACHE_TS_KEY  = 'bxzz_coins_cache_ts';
const COOLDOWN_KEY  = 'bxzz_cooldown_until';

function setCache(coins: CoinMarket[], ageMs: number): number {
  const ts = Date.now() - ageMs;
  localStorage.setItem(CACHE_KEY, JSON.stringify(coins));
  localStorage.setItem(CACHE_TS_KEY, String(ts));
  return ts;
}

// ─── TabSyncService Mock ───────────────────────────────────────────────────────

function makeTabSyncMock(isLeader = true) {
  const messages$ = new Subject<{ type: string; [key: string]: unknown }>();
  return {
    isLeader,
    isLeader$: of(isLeader),
    messages$: messages$.asObservable(),
    init:      jest.fn(),
    broadcast: jest.fn(),
    _messages$: messages$,   // exposto para testes poderem emitir mensagens
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WatchlistEffects — BXZZ Capital', () => {
  let effects:     WatchlistEffects;
  let actions$:    Subject<Action>;
  let serviceMock: { getMarketPrices: jest.Mock };
  let tabSyncMock: ReturnType<typeof makeTabSyncMock>;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['Date'] });

    actions$     = new Subject<Action>();
    serviceMock  = { getMarketPrices: jest.fn() };
    tabSyncMock  = makeTabSyncMock(true);
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        WatchlistEffects,
        provideMockActions(() => actions$),
        provideMockStore({ initialState: { watchlist: initialWatchlistState } }),
        { provide: CoinGeckoService, useValue: serviceMock },
        { provide: TabSyncService,   useValue: tabSyncMock },
      ],
    });

    effects = TestBed.inject(WatchlistEffects);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // loadPrices$
  // ═══════════════════════════════════════════════════════════════════════════

  describe('loadPrices$', () => {

    // ── 1. Cache válido (ex: F5 dentro de 5 min) ──

    it('should serve from cache and not call the API when cache is valid', (done) => {
      const coins   = [makeCoin()];
      const cacheTs = setCache(coins, 30_000); // 30s atrás — dentro do TTL de 300s
      serviceMock.getMarketPrices.mockReturnValue(of(coins));

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesSuccess({ coins, lastUpdated: cacheTs }));
        expect(serviceMock.getMarketPrices).not.toHaveBeenCalled();
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 2. Cache expirado (> 300s) ──

    it('should call the API when cache is expired', (done) => {
      const freshCoins = [makeCoin({ current_price: 65000 })];
      setCache([makeCoin({ current_price: 50000 })], 400_000); // 400s — expirado
      serviceMock.getMarketPrices.mockReturnValue(of(freshCoins));
      const before = Date.now();

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesSuccess({ coins: freshCoins, lastUpdated: expect.any(Number) }));
        expect((action as ReturnType<typeof loadPricesSuccess>).lastUpdated).toBeGreaterThanOrEqual(before);
        expect(serviceMock.getMarketPrices).toHaveBeenCalledTimes(1);
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 3. Cold start (localStorage totalmente limpo) ──

    it('should call the API when there is no cache (cold start)', (done) => {
      const coins = [makeCoin()];
      serviceMock.getMarketPrices.mockReturnValue(of(coins));
      const before = Date.now();

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesSuccess({ coins, lastUpdated: expect.any(Number) }));
        expect((action as ReturnType<typeof loadPricesSuccess>).lastUpdated).toBeGreaterThanOrEqual(before);
        expect(serviceMock.getMarketPrices).toHaveBeenCalledTimes(1);
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 4. Grava cache após resposta da API ──

    it('should write coins and timestamp to localStorage after a successful API call', (done) => {
      const coins  = [makeCoin()];
      const before = Date.now();
      serviceMock.getMarketPrices.mockReturnValue(of(coins));

      effects.loadPrices$.subscribe(() => {
        const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as CoinMarket[];
        const ts    = Number(localStorage.getItem(CACHE_TS_KEY));

        expect(saved).toEqual(coins);
        expect(ts).toBeGreaterThanOrEqual(before);
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 5. lastUpdated na action é o mesmo timestamp gravado no cache ──

    it('should emit lastUpdated that matches the cache timestamp written to localStorage', (done) => {
      const coins = [makeCoin()];
      serviceMock.getMarketPrices.mockReturnValue(of(coins));

      effects.loadPrices$.subscribe((action) => {
        const cacheTs = Number(localStorage.getItem(CACHE_TS_KEY));
        expect((action as ReturnType<typeof loadPricesSuccess>).lastUpdated).toBe(cacheTs);
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 6. Cooldown ativo — redispacha enterCooldown sem chamar a API ──

    it('should dispatch enterCooldown when cooldown is active in localStorage', (done) => {
      const cooldownUntil = Date.now() + 300_000;
      localStorage.setItem(COOLDOWN_KEY, String(cooldownUntil));
      serviceMock.getMarketPrices.mockReturnValue(of([makeCoin()]));

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(enterCooldown({ cooldownUntil }));
        expect(serviceMock.getMarketPrices).not.toHaveBeenCalled();
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 7. Erro 429 com cache stale — emite enterCooldown + loadPricesSuccess com dados obsoletos ──

    it('should emit enterCooldown and loadPricesSuccess with stale data on 429', (done) => {
      const staleCoins = [makeCoin({ current_price: 55000 })];
      const staleTs    = setCache(staleCoins, 400_000); // expirado mas disponível
      serviceMock.getMarketPrices.mockReturnValue(
        throwError(() => ({ status: 429, message: 'Too Many Requests' })),
      );

      const emitted: Action[] = [];

      effects.loadPrices$.subscribe({
        next: (action) => {
          emitted.push(action);
          if (emitted.length === 2) {
            expect(emitted[0]).toMatchObject({ type: '[Watchlist] Enter Cooldown' });
            expect(emitted[1]).toEqual(loadPricesSuccess({ coins: staleCoins, lastUpdated: staleTs }));
            expect(serviceMock.getMarketPrices).toHaveBeenCalledTimes(1);
            expect(localStorage.getItem(COOLDOWN_KEY)).not.toBeNull();
            done();
          }
        },
      });

      actions$.next(loadPrices());
    });

    // ── 8. Erro 429 sem cache — emite enterCooldown + loadPricesFailure ──

    it('should emit enterCooldown and loadPricesFailure on 429 when no cache exists', (done) => {
      serviceMock.getMarketPrices.mockReturnValue(
        throwError(() => ({ status: 429, message: 'Too Many Requests' })),
      );

      const emitted: Action[] = [];

      effects.loadPrices$.subscribe({
        next: (action) => {
          emitted.push(action);
          if (emitted.length === 2) {
            expect(emitted[0]).toMatchObject({ type: '[Watchlist] Enter Cooldown' });
            expect(emitted[1]).toMatchObject({ type: '[Watchlist] Load Prices Failure' });
            done();
          }
        },
      });

      actions$.next(loadPrices());
    });

    // ── 9. Erro genérico ──

    it('should emit loadPricesFailure with the error message on a generic API error', (done) => {
      serviceMock.getMarketPrices.mockReturnValue(
        throwError(() => ({ status: 500, message: 'Internal Server Error' })),
      );

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesFailure({ error: 'Internal Server Error' }));
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 10. Log de auditoria — cache hit ──

    it('should log a rate-limit protection message when serving from valid cache', (done) => {
      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      setCache([makeCoin()], 30_000);

      effects.loadPrices$.subscribe(() => {
        expect(infoSpy).toHaveBeenCalledWith(
          expect.stringContaining('Rate Limit Protection'),
        );
        infoSpy.mockRestore();
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 11. Follower sem cache — não faz requisição (aguarda broadcastSync$) ──

    it('should do nothing (EMPTY) when tab is follower and cache is missing', () => {
      // Recria o TestBed com isLeader = false
      TestBed.resetTestingModule();
      const followerMock = makeTabSyncMock(false);
      actions$ = new Subject<Action>();

      TestBed.configureTestingModule({
        providers: [
          WatchlistEffects,
          provideMockActions(() => actions$),
          provideMockStore({ initialState: { watchlist: initialWatchlistState } }),
          { provide: CoinGeckoService, useValue: serviceMock },
          { provide: TabSyncService,   useValue: followerMock },
        ],
      });

      const followerEffects = TestBed.inject(WatchlistEffects);
      let emitted = false;

      followerEffects.loadPrices$.subscribe(() => { emitted = true; });
      actions$.next(loadPrices());

      expect(emitted).toBe(false);
      expect(serviceMock.getMarketPrices).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // broadcastSync$
  // ═══════════════════════════════════════════════════════════════════════════

  describe('broadcastSync$', () => {

    // ── 12. Sincroniza quando líder transmite preços atualizados ──

    it('should dispatch loadPricesSuccess when leader broadcasts prices-updated', (done) => {
      const coins       = [makeCoin()];
      const lastUpdated = Date.now();

      effects.broadcastSync$.subscribe((action) => {
        expect(action).toEqual(loadPricesSuccess({ coins, lastUpdated }));
        done();
      });

      (effects as any).renderReady$.next();

      tabSyncMock._messages$.next({ type: 'prices-updated', coins, lastUpdated });
    });

    // ── 13. Sincroniza cooldown quando líder transmite cooldown-started ──

    it('should dispatch enterCooldown when leader broadcasts cooldown-started', (done) => {
      const cooldownUntil = Date.now() + 300_000;

      effects.broadcastSync$.subscribe((action) => {
        expect(action).toEqual(enterCooldown({ cooldownUntil }));
        done();
      });

      (effects as any).renderReady$.next();

      tabSyncMock._messages$.next({ type: 'cooldown-started', cooldownUntil });
    });

    // ── 14. Ignora mensagens de outros tipos (heartbeat, leader-stepping-down) ──

    it('should not emit for unrelated message types', () => {
      let emitted = false;
      effects.broadcastSync$.subscribe(() => { emitted = true; });

      (effects as any).renderReady$.next();

      tabSyncMock._messages$.next({ type: 'heartbeat', tabId: 'other-tab' });
      tabSyncMock._messages$.next({ type: 'leader-stepping-down', tabId: 'other-tab' });

      expect(emitted).toBe(false);
    });

    // ── 15. prices-updated sem coins — deve ser ignorado (double-guard) ──

    it('should not emit when prices-updated message is missing coins', () => {
      let emitted = false;
      effects.broadcastSync$.subscribe(() => { emitted = true; });

      (effects as any).renderReady$.next();

      tabSyncMock._messages$.next({ type: 'prices-updated', lastUpdated: Date.now() } as any);

      expect(emitted).toBe(false);
    });

    // ── 16. prices-updated sem lastUpdated — deve ser ignorado (double-guard) ──

    it('should not emit when prices-updated message is missing lastUpdated', () => {
      let emitted = false;
      effects.broadcastSync$.subscribe(() => { emitted = true; });

      (effects as any).renderReady$.next();

      tabSyncMock._messages$.next({ type: 'prices-updated', coins: [makeCoin()] } as any);

      expect(emitted).toBe(false);
    });

    // ── 17. Tipo de mensagem completamente desconhecido — deve ser ignorado ──

    it('should not emit for a completely unknown message type', () => {
      let emitted = false;
      effects.broadcastSync$.subscribe(() => { emitted = true; });

      (effects as any).renderReady$.next();

      tabSyncMock._messages$.next({ type: 'unknown-future-type', data: 'anything' } as any);

      expect(emitted).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // onBecomeLeader$
  // ═══════════════════════════════════════════════════════════════════════════

  describe('onBecomeLeader$', () => {

    // ── 18. Cold-start como líder sem cache — dispara loadPrices imediatamente ──

    it('should dispatch loadPrices immediately on cold-start as leader with no cache and no lastUpdated', (done) => {
      // Simula: isLeader$ emite true logo após renderReady$ (sem skip(1) o efeito deve reagir)
      const isLeader$ = new Subject<boolean>();
      TestBed.resetTestingModule();
      actions$ = new Subject<Action>();

      const leaderMock = {
        ...makeTabSyncMock(true),
        isLeader$: isLeader$.asObservable(),
      };

      TestBed.configureTestingModule({
        providers: [
          WatchlistEffects,
          provideMockActions(() => actions$),
          provideMockStore({ initialState: { watchlist: initialWatchlistState } }), // lastUpdated: null
          { provide: CoinGeckoService, useValue: serviceMock },
          { provide: TabSyncService,   useValue: leaderMock },
        ],
      });

      const leaderEffects = TestBed.inject(WatchlistEffects);

      leaderEffects.onBecomeLeader$.subscribe((action) => {
        expect(action).toEqual(loadPrices());
        done();
      });

      // Simula afterNextRender(): primeiro init() elege líder, depois renderReady$ emite
      (leaderEffects as any).renderReady$.next();
      isLeader$.next(true); // tab acabou de virar líder no boot
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // broadcastPrices$
  // ═══════════════════════════════════════════════════════════════════════════

  describe('broadcastPrices$', () => {

    // ── 19. Líder transmite preços para seguidoras após loadPricesSuccess ──

    it('should call tabSync.broadcast with prices-updated after loadPricesSuccess as leader', () => {
      const coins       = [makeCoin()];
      const lastUpdated = Date.now();

      effects.broadcastPrices$.subscribe();
      (effects as any).renderReady$.next();

      actions$.next(loadPricesSuccess({ coins, lastUpdated }));

      expect(tabSyncMock.broadcast).toHaveBeenCalledWith({
        type: 'prices-updated',
        coins,
        lastUpdated,
      });
    });
  });
});
