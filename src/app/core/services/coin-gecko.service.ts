import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, map } from 'rxjs/operators';

import type { CoinMarket, CoinMarketsParams, ApiError } from '../interfaces/coin.interface';
import { environment } from '../../../environments/environment';

/**
 * Princípio SOLID — Dependency Inversion:
 * O service depende da abstração HttpClient (injetada pelo Angular DI),
 * não de uma implementação concreta de HTTP. Isso permite trocar o
 * mecanismo de transporte (fetch, mock, etc.) sem alterar esta classe.
 *
 * Princípio SOLID — Single Responsibility:
 * Esta classe tem apenas uma razão para mudar: a API da CoinGecko.
 */
@Injectable({ providedIn: 'root' })
export class CoinGeckoService {
  private readonly http = inject(HttpClient);

  private readonly BASE_URL = environment.apiBase;

  /** IDs padrão da watchlist inicial — demonstra configuração declarativa */
  readonly DEFAULT_COIN_IDS = [
    'bitcoin',
    'ethereum',
    'solana',
    'cardano',
    'polkadot',
    'chainlink',
  ];

  /**
   * Busca preços de mercado em tempo real da CoinGecko.
   * Retorna Observable para integração direta com NgRx Effects.
   */
  getMarketPrices(params: Partial<CoinMarketsParams> = {}): Observable<CoinMarket[]> {
    const defaults: CoinMarketsParams = {
      vs_currency: 'usd',
      ids:         this.DEFAULT_COIN_IDS.join(','),
      order:       'market_cap_desc',
      per_page:    20,
      page:        1,
      sparkline:   false,
    };

    const merged = { ...defaults, ...params };
    const httpParams = this.buildHttpParams(merged);

    return this.http
      .get<CoinMarket[]>(`${this.BASE_URL}/coins/markets`, { params: httpParams })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        map((coins) => this.normalizePrices(coins)),
        catchError(this.handleError),
      );
  }

  /** Busca um único ativo pelo ID */
  getCoinById(id: string): Observable<CoinMarket> {
    const httpParams = this.buildHttpParams({ vs_currency: 'usd', ids: id, per_page: 1, page: 1 });

    return this.http
      .get<CoinMarket[]>(`${this.BASE_URL}/coins/markets`, { params: httpParams })
      .pipe(
        map((coins) => {
          if (!coins.length) throw new Error(`Coin "${id}" not found.`);
          return coins[0];
        }),
        catchError(this.handleError),
      );
  }

  /** Garante que valores numéricos vindos da API nunca sejam null/undefined */
  private normalizePrices(coins: CoinMarket[]): CoinMarket[] {
    return coins.map((coin) => ({
      ...coin,
      current_price:               coin.current_price ?? 0,
      price_change_24h:            coin.price_change_24h ?? 0,
      price_change_percentage_24h: coin.price_change_percentage_24h ?? 0,
    }));
  }

  private buildHttpParams(params: Record<string, unknown>): HttpParams {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        httpParams = httpParams.set(key, String(value));
      }
    });
    return httpParams;
  }

  /**
   * Normaliza erros HTTP em ApiError tipado.
   * Princípio SOLID — SRP: lógica de normalização de erro isolada aqui.
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    const apiError: ApiError = {
      message: error.error?.error ?? error.message ?? 'Erro desconhecido',
      status:  error.status,
    };

    if (error.status === 429) {
      apiError.message = 'Limite de requisições atingido. Aguarde alguns instantes.';
    } else if (error.status === 0) {
      apiError.message = 'Sem conexão com a internet ou serviço indisponível.';
    }

    return throwError(() => apiError);
  }
}
