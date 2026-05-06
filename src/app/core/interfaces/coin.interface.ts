/**
 * Contratos de API — definidos antes da implementação do service,
 * como num contrato formal entre Front-end e Back-end.
 * Princípio SOLID: Interface Segregation — cada interface tem responsabilidade única.
 */

/** Resposta bruta da rota /coins/markets da CoinGecko */
export interface CoinMarket {
  id:                                  string;
  symbol:                              string;
  name:                                string;
  image:                               string;
  current_price:                       number;
  market_cap:                          number;
  market_cap_rank:                     number;
  fully_diluted_valuation:             number | null;
  total_volume:                        number;
  high_24h:                            number;
  low_24h:                             number;
  price_change_24h:                    number;
  price_change_percentage_24h:         number;
  market_cap_change_24h:               number;
  market_cap_change_percentage_24h:    number;
  circulating_supply:                  number;
  total_supply:                        number | null;
  max_supply:                          number | null;
  ath:                                 number;
  ath_change_percentage:               number;
  ath_date:                            string;
  atl:                                 number;
  atl_change_percentage:               number;
  atl_date:                            string;
  last_updated:                        string;
}

/** Parâmetros aceitos pela rota /coins/markets */
export interface CoinMarketsParams {
  vs_currency: string;
  ids?:        string;
  order?:      'market_cap_desc' | 'market_cap_asc' | 'volume_desc' | 'volume_asc';
  per_page?:   number;
  page?:       number;
  sparkline?:  boolean;
}

/** Ativo adicionado à watchlist pelo usuário — estende CoinMarket com dados de portfólio */
export interface WatchlistAsset extends CoinMarket {
  purchasePrice:    number;   // preço médio de compra
  quantity:         number;   // quantidade em custódia
  addedAt:          number;   // timestamp Unix
}

/** Resultado calculado de rentabilidade de um ativo — produzido por seletores */
export interface AssetProfitability {
  coinId:           string;
  currentValue:     number;
  investedValue:    number;
  profitLoss:       number;
  profitLossPercent: number;
}

/** Resumo consolidado do portfólio — calculado no Selector (memoized) */
export interface PortfolioSummary {
  totalCurrentValue:  number;
  totalInvestedValue: number;
  totalProfitLoss:    number;
  totalProfitLossPercent: number;
  assetCount:         number;
}

/** Envelope de erro normalizado — garante tipagem forte nas respostas de falha */
export interface ApiError {
  message: string;
  status:  number;
}
