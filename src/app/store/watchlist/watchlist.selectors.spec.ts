import {
  selectAllAssets,
  selectLoading,
  selectError,
  selectAssetProfitabilities,
  selectPortfolioSummary,
  selectIsInWatchlist,
} from './watchlist.selectors';
import { initialWatchlistState, WatchlistState } from './watchlist.state';
import type { WatchlistAsset } from '../../core/interfaces/coin.interface';

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<WatchlistAsset> = {}): WatchlistAsset {
  return {
    id:                               'bitcoin',
    symbol:                           'btc',
    name:                             'Bitcoin',
    image:                            '',
    current_price:                    60000,
    market_cap:                       0,
    market_cap_rank:                  1,
    fully_diluted_valuation:          null,
    total_volume:                     0,
    high_24h:                         0,
    low_24h:                          0,
    price_change_24h:                 0,
    price_change_percentage_24h:      0,
    market_cap_change_24h:            0,
    market_cap_change_percentage_24h: 0,
    circulating_supply:               0,
    total_supply:                     null,
    max_supply:                       null,
    ath:                              0,
    ath_change_percentage:            0,
    ath_date:                         '',
    atl:                              0,
    atl_change_percentage:            0,
    atl_date:                         '',
    last_updated:                     '',
    purchasePrice:                    42000,
    quantity:                         1,
    addedAt:                          0,
    ...overrides,
  };
}

function buildState(overrides: Partial<WatchlistState> = {}): { watchlist: WatchlistState } {
  return { watchlist: { ...initialWatchlistState, ...overrides } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Watchlist Selectors', () => {

  describe('selectAllAssets', () => {
    it('should return the assets array from state', () => {
      const asset = makeAsset();
      const state = buildState({ assets: [asset] });
      expect(selectAllAssets(state)).toEqual([asset]);
    });
  });

  describe('selectLoading', () => {
    it('should return the loading flag', () => {
      expect(selectLoading(buildState({ loading: true }))).toBe(true);
      expect(selectLoading(buildState({ loading: false }))).toBe(false);
    });
  });

  describe('selectError', () => {
    it('should return the error message', () => {
      expect(selectError(buildState({ error: 'fail' }))).toBe('fail');
      expect(selectError(buildState({ error: null }))).toBeNull();
    });
  });

  describe('selectIsInWatchlist', () => {
    it('should return true when the coin is in the watchlist', () => {
      const state = buildState({ assets: [makeAsset({ id: 'bitcoin' })] });
      expect(selectIsInWatchlist('bitcoin')(state)).toBe(true);
    });

    it('should return false when the coin is not in the watchlist', () => {
      const state = buildState({ assets: [] });
      expect(selectIsInWatchlist('bitcoin')(state)).toBe(false);
    });
  });

  // ── Profitability calculations ──

  describe('selectAssetProfitabilities', () => {
    it('should calculate profitLoss correctly for a profitable position', () => {
      // Comprou a $42k, está a $60k → lucro de $18k
      const asset = makeAsset({ current_price: 60000, purchasePrice: 42000, quantity: 1 });
      const state = buildState({ assets: [asset] });
      const [result] = selectAssetProfitabilities(state);

      expect(result.currentValue).toBeCloseTo(60000);
      expect(result.investedValue).toBeCloseTo(42000);
      expect(result.profitLoss).toBeCloseTo(18000);
      expect(result.profitLossPercent).toBeCloseTo(42.857, 2);
    });

    it('should calculate a negative profitLoss for a losing position', () => {
      // Comprou a $60k, está a $42k → prejuízo de $18k
      const asset = makeAsset({ current_price: 42000, purchasePrice: 60000, quantity: 1 });
      const state = buildState({ assets: [asset] });
      const [result] = selectAssetProfitabilities(state);

      expect(result.profitLoss).toBeCloseTo(-18000);
      expect(result.profitLossPercent).toBeCloseTo(-30);
    });

    it('should return zero profitLossPercent when investedValue is zero', () => {
      const asset = makeAsset({ purchasePrice: 0, quantity: 1 });
      const state = buildState({ assets: [asset] });
      const [result] = selectAssetProfitabilities(state);

      expect(result.profitLossPercent).toBe(0);
    });

    it('should account for quantity in currentValue and investedValue', () => {
      const asset = makeAsset({ current_price: 60000, purchasePrice: 42000, quantity: 2 });
      const state = buildState({ assets: [asset] });
      const [result] = selectAssetProfitabilities(state);

      expect(result.currentValue).toBeCloseTo(120000);
      expect(result.investedValue).toBeCloseTo(84000);
    });
  });

  // ── Portfolio summary (aggregated) ──

  describe('selectPortfolioSummary', () => {
    it('should aggregate profitabilities across all assets', () => {
      const btc = makeAsset({ id: 'bitcoin',  current_price: 60000, purchasePrice: 42000, quantity: 1 });
      const eth = makeAsset({ id: 'ethereum', current_price: 3000,  purchasePrice: 2000,  quantity: 2 });
      const state = buildState({ assets: [btc, eth] });
      const summary = selectPortfolioSummary(state);

      // BTC: invested=42000, current=60000 → P&L=+18000
      // ETH: invested=4000,  current=6000  → P&L=+2000
      expect(summary.totalCurrentValue).toBeCloseTo(66000);
      expect(summary.totalInvestedValue).toBeCloseTo(46000);
      expect(summary.totalProfitLoss).toBeCloseTo(20000);
      expect(summary.assetCount).toBe(2);
    });

    it('should return zeros for an empty watchlist', () => {
      const summary = selectPortfolioSummary(buildState({ assets: [] }));

      expect(summary.totalCurrentValue).toBe(0);
      expect(summary.totalInvestedValue).toBe(0);
      expect(summary.totalProfitLoss).toBe(0);
      expect(summary.totalProfitLossPercent).toBe(0);
      expect(summary.assetCount).toBe(0);
    });
  });
});
