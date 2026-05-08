import type { WatchlistAsset } from '@src/app/core/interfaces/coin.interface';

export interface WatchlistState {
  assets:        WatchlistAsset[];
  loading:       boolean;
  error:         string | null;
  lastUpdated:   number | null;
  cooldownUntil: number | null;
}

export const initialWatchlistState: WatchlistState = {
  assets:        [],
  loading:       false,
  error:         null,
  lastUpdated:   null,
  cooldownUntil: null,
};
