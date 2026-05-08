import { createReducer, on } from '@ngrx/store';

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
import { initialWatchlistState } from './watchlist.state';
import type { WatchlistAsset } from '@src/app/core/interfaces/coin.interface';

export const watchlistReducer = createReducer(
  initialWatchlistState,

  // Imutabilidade: spread cria novo array sem mutar o estado anterior
  on(addToWatchlist, (state, { asset }) => {
    const alreadyExists = state.assets.some((a) => a.id === asset.id);
    if (alreadyExists) return state;
    return { ...state, assets: [...state.assets, asset] };
  }),

  on(removeFromWatchlist, (state, { coinId }) => ({
    ...state,
    assets: state.assets.filter((a) => a.id !== coinId),
  })),

  on(clearWatchlist, (state) => ({ ...state, assets: [] })),

  // Limpa cooldownUntil ao iniciar nova tentativa — oculta o banner de cooldown
  on(loadPrices, (state) => ({ ...state, loading: true, error: null, cooldownUntil: null })),

  on(loadPricesSuccess, (state, { coins, lastUpdated }) => ({
    ...state,
    loading:  false,
    lastUpdated,
    // Merge imutável: atualiza preços dos ativos já existentes na watchlist
    assets: state.assets.map((asset) => {
      const updated = coins.find((c) => c.id === asset.id);
      return updated
        ? ({ ...asset, ...updated } as WatchlistAsset)
        : asset;
    }),
  })),

  on(loadPricesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  on(enterCooldown, (state, { cooldownUntil }) => ({
    ...state,
    loading: false,
    cooldownUntil,
  })),

  on(clearCooldown, (state) => ({
    ...state,
    cooldownUntil: null,
  })),
);
