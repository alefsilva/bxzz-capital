import { watchlistReducer } from './watchlist.reducer';
import { initialWatchlistState } from './watchlist.state';
import {
  addToWatchlist,
  removeFromWatchlist,
  clearWatchlist,
  loadPrices,
  loadPricesSuccess,
  loadPricesFailure,
  enterCooldown,
  clearCooldown,
} from './watchlist.actions';
import type { WatchlistAsset, CoinMarket } from '@src/app/core/interfaces/coin.interface';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<WatchlistAsset> = {}): WatchlistAsset {
  return {
    id:                               'bitcoin',
    symbol:                           'btc',
    name:                             'Bitcoin',
    image:                            'https://example.com/btc.png',
    current_price:                    50000,
    market_cap:                       1_000_000_000,
    market_cap_rank:                  1,
    fully_diluted_valuation:          null,
    total_volume:                     30_000_000,
    high_24h:                         51000,
    low_24h:                          49000,
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
    purchasePrice:                    42000,
    quantity:                         0.5,
    addedAt:                          1000000,
    ...overrides,
  };
}

function makeCoinMarket(overrides: Partial<CoinMarket> = {}): CoinMarket {
  return {
    id:                               'bitcoin',
    symbol:                           'btc',
    name:                             'Bitcoin',
    image:                            'https://example.com/btc.png',
    current_price:                    60000,
    market_cap:                       1_200_000_000,
    market_cap_rank:                  1,
    fully_diluted_valuation:          null,
    total_volume:                     40_000_000,
    high_24h:                         61000,
    low_24h:                          59000,
    price_change_24h:                 1000,
    price_change_percentage_24h:      2.0,
    market_cap_change_24h:            0,
    market_cap_change_percentage_24h: 0,
    circulating_supply:               19_000_000,
    total_supply:                     21_000_000,
    max_supply:                       21_000_000,
    ath:                              69000,
    ath_change_percentage:            -13,
    ath_date:                         '2021-11-10',
    atl:                              67.81,
    atl_change_percentage:            88000,
    atl_date:                         '2013-07-06',
    last_updated:                     '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('watchlistReducer — BXZZ Capital', () => {

  it('should return the initial state for an unknown action', () => {
    const state = watchlistReducer(undefined, { type: '@@INIT' });
    expect(state).toEqual(initialWatchlistState);
  });

  // ── addToWatchlist ──

  describe('addToWatchlist', () => {
    it('should add a new asset to the watchlist', () => {
      const asset = makeAsset();
      const state = watchlistReducer(initialWatchlistState, addToWatchlist({ asset }));

      expect(state.assets).toHaveLength(1);
      expect(state.assets[0].id).toBe('bitcoin');
    });

    it('should not add a duplicate asset', () => {
      const asset  = makeAsset();
      const after1 = watchlistReducer(initialWatchlistState, addToWatchlist({ asset }));
      const after2 = watchlistReducer(after1, addToWatchlist({ asset }));

      expect(after2.assets).toHaveLength(1);
    });

    it('should preserve immutability — returns a new array reference', () => {
      const asset  = makeAsset();
      const before = initialWatchlistState.assets;
      const after  = watchlistReducer(initialWatchlistState, addToWatchlist({ asset })).assets;

      expect(after).not.toBe(before);
    });
  });

  // ── removeFromWatchlist ──

  describe('removeFromWatchlist', () => {
    it('should remove the asset by coinId', () => {
      const asset       = makeAsset();
      const withAsset   = watchlistReducer(initialWatchlistState, addToWatchlist({ asset }));
      const afterRemove = watchlistReducer(withAsset, removeFromWatchlist({ coinId: 'bitcoin' }));

      expect(afterRemove.assets).toHaveLength(0);
    });

    it('should not affect state when coinId does not exist', () => {
      const asset     = makeAsset();
      const withAsset = watchlistReducer(initialWatchlistState, addToWatchlist({ asset }));
      const after     = watchlistReducer(withAsset, removeFromWatchlist({ coinId: 'ethereum' }));

      expect(after.assets).toHaveLength(1);
    });
  });

  // ── clearWatchlist ──

  describe('clearWatchlist', () => {
    it('should remove all assets', () => {
      const withAsset = watchlistReducer(initialWatchlistState, addToWatchlist({ asset: makeAsset() }));
      const cleared   = watchlistReducer(withAsset, clearWatchlist());

      expect(cleared.assets).toHaveLength(0);
    });
  });

  // ── loadPrices ──

  describe('loadPrices', () => {
    it('should set loading to true and clear any previous error', () => {
      const stateWithError = { ...initialWatchlistState, error: 'previous error' };
      const state          = watchlistReducer(stateWithError, loadPrices());

      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('should clear cooldownUntil when a new load attempt begins', () => {
      const stateWithCooldown = { ...initialWatchlistState, cooldownUntil: Date.now() + 300_000 };
      const state             = watchlistReducer(stateWithCooldown, loadPrices());

      expect(state.cooldownUntil).toBeNull();
    });
  });

  // ── loadPricesSuccess ──

  describe('loadPricesSuccess', () => {
    it('should set loading to false and update prices for existing assets', () => {
      const asset        = makeAsset({ current_price: 50000 });
      const updatedCoin  = makeCoinMarket({ current_price: 60000 });

      const withAsset    = watchlistReducer(initialWatchlistState, addToWatchlist({ asset }));
      const withLoading  = watchlistReducer(withAsset, loadPrices());
      const afterSuccess = watchlistReducer(withLoading, loadPricesSuccess({ coins: [updatedCoin], lastUpdated: Date.now() }));

      expect(afterSuccess.loading).toBe(false);
      expect(afterSuccess.assets[0].current_price).toBe(60000);
      expect(afterSuccess.lastUpdated).not.toBeNull();
    });

    it('should not throw and should preserve assets when coins is undefined (defensive)', () => {
      const asset    = makeAsset();
      const withAsset = watchlistReducer(initialWatchlistState, addToWatchlist({ asset }));
      // Simula payload corrompido que chegaria via BroadcastChannel malformado
      const state = watchlistReducer(withAsset, loadPricesSuccess({ coins: undefined as any, lastUpdated: Date.now() }));

      expect(state.loading).toBe(false);
      expect(state.assets).toHaveLength(1);
      expect(state.assets[0].id).toBe('bitcoin');
    });

    it('should preserve purchasePrice and quantity after a price update', () => {
      const asset        = makeAsset({ purchasePrice: 42000, quantity: 0.5 });
      const updatedCoin  = makeCoinMarket({ current_price: 60000 });

      const withAsset    = watchlistReducer(initialWatchlistState, addToWatchlist({ asset }));
      const afterSuccess = watchlistReducer(withAsset, loadPricesSuccess({ coins: [updatedCoin], lastUpdated: Date.now() }));

      expect(afterSuccess.assets[0].purchasePrice).toBe(42000);
      expect(afterSuccess.assets[0].quantity).toBe(0.5);
    });
  });

  // ── loadPricesFailure ──

  describe('loadPricesFailure', () => {
    it('should set loading to false and store the error message', () => {
      const withLoading = watchlistReducer(initialWatchlistState, loadPrices());
      const afterFail   = watchlistReducer(withLoading, loadPricesFailure({ error: 'Network error' }));

      expect(afterFail.loading).toBe(false);
      expect(afterFail.error).toBe('Network error');
    });
  });

  // ── enterCooldown ──

  describe('enterCooldown', () => {
    it('should set cooldownUntil and set loading to false', () => {
      const cooldownUntil = Date.now() + 300_000;
      const withLoading   = watchlistReducer(initialWatchlistState, loadPrices());
      const state         = watchlistReducer(withLoading, enterCooldown({ cooldownUntil }));

      expect(state.cooldownUntil).toBe(cooldownUntil);
      expect(state.loading).toBe(false);
    });

    it('should overwrite a previous cooldownUntil with the new value', () => {
      const first  = Date.now() + 100_000;
      const second = Date.now() + 300_000;
      const after1 = watchlistReducer(initialWatchlistState, enterCooldown({ cooldownUntil: first }));
      const after2 = watchlistReducer(after1, enterCooldown({ cooldownUntil: second }));

      expect(after2.cooldownUntil).toBe(second);
    });
  });

  // ── clearCooldown ──

  describe('clearCooldown', () => {
    it('should set cooldownUntil to null', () => {
      const withCooldown = watchlistReducer(
        initialWatchlistState,
        enterCooldown({ cooldownUntil: Date.now() + 300_000 }),
      );
      const cleared = watchlistReducer(withCooldown, clearCooldown());

      expect(cleared.cooldownUntil).toBeNull();
    });
  });
});
