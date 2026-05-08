import { createFeatureSelector, createSelector } from '@ngrx/store';

import type { WatchlistState } from './watchlist.state';
import type { AssetProfitability, PortfolioSummary } from '@src/app/core/interfaces/coin.interface';

// Selector raiz que localiza o slice 'watchlist' no AppState
export const selectWatchlistState = createFeatureSelector<WatchlistState>('watchlist');

// ─── Seletores primitivos ─────────────────────────────────────────────────────

export const selectAllAssets    = createSelector(selectWatchlistState, (s) => s.assets);
export const selectLoading      = createSelector(selectWatchlistState, (s) => s.loading);
export const selectError        = createSelector(selectWatchlistState, (s) => s.error);
export const selectLastUpdated  = createSelector(selectWatchlistState, (s) => s.lastUpdated);
export const selectAssetCount   = createSelector(selectAllAssets, (assets) => assets.length);
export const selectCooldownUntil = createSelector(selectWatchlistState, (s) => s.cooldownUntil);

export const selectIsCooldown = createSelector(
  selectCooldownUntil,
  (cooldownUntil) => !!cooldownUntil && cooldownUntil > Date.now(),
);

export const selectIsInWatchlist = (coinId: string) =>
  createSelector(selectAllAssets, (assets) => assets.some((a) => a.id === coinId));

// ─── Seletor de rentabilidade por ativo ──────────────────────────────────────

export const selectAssetProfitabilities = createSelector(
  selectAllAssets,
  /**
   * POR QUÊ esta lógica está no Selector e não no componente?
   *
   * Memoization: createSelector memoriza o resultado. Enquanto `selectAllAssets`
   * retornar a mesma referência (o que o reducer garante via imutabilidade),
   * este cálculo NÃO é reexecutado. O componente sempre recebe o resultado em cache.
   *
   * Separação de responsabilidades: o componente só renderiza dados prontos;
   * a lógica de negócio fica centralizada e testável isoladamente.
   */
  (assets): AssetProfitability[] =>
    assets.map((asset) => {
      const investedValue  = asset.purchasePrice * asset.quantity;
      const currentValue   = asset.current_price * asset.quantity;
      const profitLoss     = currentValue - investedValue;
      const profitLossPercent =
        investedValue > 0 ? (profitLoss / investedValue) * 100 : 0;

      return {
        coinId:           asset.id,
        currentValue,
        investedValue,
        profitLoss,
        profitLossPercent,
      };
    }),
);

// ─── Seletor de resumo total do portfólio ─────────────────────────────────────

export const selectPortfolioSummary = createSelector(
  selectAssetProfitabilities,
  selectAssetCount,
  /**
   * POR QUÊ a rentabilidade total está aqui e não no componente?
   *
   * Este seletor é derivado de `selectAssetProfitabilities`, que já é memoizado.
   * O Angular só reavalia o componente quando o valor emitido pelo seletor muda
   * de referência — com ChangeDetectionStrategy.OnPush isso se traduz em
   * zero re-renders desnecessários mesmo com dados de mercado voláteis.
   */
  (profitabilities, assetCount): PortfolioSummary => {
    const totalCurrentValue  = profitabilities.reduce((sum, p) => sum + p.currentValue, 0);
    const totalInvestedValue = profitabilities.reduce((sum, p) => sum + p.investedValue, 0);
    const totalProfitLoss    = totalCurrentValue - totalInvestedValue;
    const totalProfitLossPercent =
      totalInvestedValue > 0 ? (totalProfitLoss / totalInvestedValue) * 100 : 0;

    return { totalCurrentValue, totalInvestedValue, totalProfitLoss, totalProfitLossPercent, assetCount };
  },
);
