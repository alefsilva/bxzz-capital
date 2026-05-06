import { createAction, props } from '@ngrx/store';

import type { CoinMarket, WatchlistAsset } from '../../core/interfaces/coin.interface';

// ─── Watchlist CRUD ───────────────────────────────────────────────────────────

export const addToWatchlist = createAction(
  '[Watchlist] Add Asset',
  props<{ asset: WatchlistAsset }>(),
);

export const removeFromWatchlist = createAction(
  '[Watchlist] Remove Asset',
  props<{ coinId: string }>(),
);

export const clearWatchlist = createAction('[Watchlist] Clear All');

// ─── Price Refresh ────────────────────────────────────────────────────────────

export const loadPrices = createAction('[Watchlist] Load Prices');

export const loadPricesSuccess = createAction(
  '[Watchlist] Load Prices Success',
  props<{ coins: CoinMarket[] }>(),
);

export const loadPricesFailure = createAction(
  '[Watchlist] Load Prices Failure',
  props<{ error: string }>(),
);
