/** TTL do cache de preços: 5 minutos previne 429 no plano gratuito da CoinGecko */
export const CACHE_TTL_MS = 300_000;

/** Duração do cooldown após receber HTTP 429 */
export const COOLDOWN_MS = 300_000;
