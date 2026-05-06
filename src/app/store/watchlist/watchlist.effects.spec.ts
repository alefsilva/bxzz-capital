import { TestBed } from '@angular/core/testing';
import { Action } from '@ngrx/store';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, of, throwError } from 'rxjs';

import { WatchlistEffects } from './watchlist.effects';
import { CoinGeckoService } from '../../core/services/coin-gecko.service';
import { loadPrices, loadPricesSuccess, loadPricesFailure } from './watchlist.actions';
import type { CoinMarket } from '../../core/interfaces/coin.interface';

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

const CACHE_KEY    = 'bxzz_coins_cache';
const CACHE_TS_KEY = 'bxzz_coins_cache_ts';

function setCache(coins: CoinMarket[], ageMs: number): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(coins));
  localStorage.setItem(CACHE_TS_KEY, String(Date.now() - ageMs));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WatchlistEffects — Cache Strategy', () => {
  let effects:     WatchlistEffects;
  let actions$:    Subject<Action>;
  let serviceMock: { getMarketPrices: jest.Mock };

  beforeEach(() => {
    actions$    = new Subject<Action>();
    serviceMock = { getMarketPrices: jest.fn() };
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        WatchlistEffects,
        provideMockActions(() => actions$),
        { provide: CoinGeckoService, useValue: serviceMock },
      ],
    });

    effects = TestBed.inject(WatchlistEffects);
  });

  describe('loadPrices$', () => {

    // ── 1. Cache válido (ex: F5 dentro de 60s) ──

    it('should serve from cache and not call the API when cache is valid', (done) => {
      const coins = [makeCoin()];
      setCache(coins, 30_000); // 30s atrás — dentro do TTL de 60s
      serviceMock.getMarketPrices.mockReturnValue(of(coins));

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesSuccess({ coins }));
        expect(serviceMock.getMarketPrices).not.toHaveBeenCalled();
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 2. Cache expirado ──

    it('should call the API when cache is expired', (done) => {
      const freshCoins = [makeCoin({ current_price: 65000 })];
      setCache([makeCoin({ current_price: 50000 })], 90_000); // 90s — expirado
      serviceMock.getMarketPrices.mockReturnValue(of(freshCoins));

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesSuccess({ coins: freshCoins }));
        expect(serviceMock.getMarketPrices).toHaveBeenCalledTimes(1);
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 3. Sem cache (primeira abertura real) ──

    it('should call the API when there is no cache', (done) => {
      const coins = [makeCoin()];
      serviceMock.getMarketPrices.mockReturnValue(of(coins));

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesSuccess({ coins }));
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

    // ── 5. Erro 429 + cache disponível ──

    it('should serve stale cache and emit loadPricesSuccess on HTTP 429', (done) => {
      const staleCoins = [makeCoin({ current_price: 55000 })];
      setCache(staleCoins, 90_000); // expirado mas disponível
      serviceMock.getMarketPrices.mockReturnValue(
        throwError(() => ({ status: 429, message: 'Limite de requisições atingido.' })),
      );

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesSuccess({ coins: staleCoins }));
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 6. Erro 429 sem cache ──

    it('should emit loadPricesFailure on HTTP 429 when no cache exists', (done) => {
      serviceMock.getMarketPrices.mockReturnValue(
        throwError(() => ({ status: 429, message: 'Limite de requisições atingido.' })),
      );

      effects.loadPrices$.subscribe((action) => {
        expect(action).toEqual(loadPricesFailure({ error: 'Limite de requisições atingido.' }));
        done();
      });

      actions$.next(loadPrices());
    });

    // ── 7. Erro genérico sem cache ──

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

    // ── 8. Log de auditoria — cache hit ──

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

    // ── 9. Log de auditoria — fallback 429 ──

    it('should log a 429 recovery message when falling back to stale cache', (done) => {
      const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      setCache([makeCoin()], 90_000);
      serviceMock.getMarketPrices.mockReturnValue(
        throwError(() => ({ status: 429, message: 'Limite de requisições atingido.' })),
      );

      effects.loadPrices$.subscribe(() => {
        expect(infoSpy).toHaveBeenCalledWith(
          expect.stringContaining('429'),
        );
        infoSpy.mockRestore();
        done();
      });

      actions$.next(loadPrices());
    });
  });
});
