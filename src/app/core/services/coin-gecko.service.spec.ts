import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { CoinGeckoService } from './coin-gecko.service';
import type { CoinMarket } from '../interfaces/coin.interface';

// ─── Fábrica de dados de teste ────────────────────────────────────────────────

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

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('CoinGeckoService', () => {
  let service:  CoinGeckoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CoinGeckoService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service  = TestBed.inject(CoinGeckoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  // Garante que nenhuma requisição ficou pendente sem ser verificada
  afterEach(() => httpMock.verify());

  // ── getMarketPrices ──

  describe('getMarketPrices', () => {
    it('should call the CoinGecko /coins/markets endpoint with GET', () => {
      const mockCoins = [makeCoin()];

      service.getMarketPrices().subscribe();

      const req = httpMock.expectOne((r) =>
        r.url.includes('/coins/markets') && r.method === 'GET',
      );
      req.flush(mockCoins);
    });

    it('should emit the normalized coin array on success', (done) => {
      const mockCoins = [makeCoin()];

      service.getMarketPrices().subscribe((coins) => {
        expect(coins).toHaveLength(1);
        expect(coins[0].id).toBe('bitcoin');
        done();
      });

      const req = httpMock.expectOne((r) => r.url.includes('/coins/markets'));
      req.flush(mockCoins);
    });

    it('should replace null current_price with 0 (normalization)', (done) => {
      // A API pode retornar null em alguns campos numéricos; o service normaliza
      const mockCoins = [makeCoin({ current_price: null as unknown as number })];

      service.getMarketPrices().subscribe((coins) => {
        expect(coins[0].current_price).toBe(0);
        done();
      });

      const req = httpMock.expectOne((r) => r.url.includes('/coins/markets'));
      req.flush(mockCoins);
    });

    it('should emit an ApiError with a rate-limit message on HTTP 429', async () => {
      // Jest fake timers controlam o delay de 1000ms entre cada tentativa do retry({ count: 2 })
      // fakeAsync não está disponível em ambiente zoneless — usamos jest.useFakeTimers()
      jest.useFakeTimers();
      let capturedError: any;

      service.getMarketPrices().subscribe({ error: (err) => (capturedError = err) });

      // Tentativa 1 (inicial)
      httpMock.expectOne((r) => r.url.includes('/coins/markets'))
        .flush({ error: 'rate limited' }, { status: 429, statusText: 'Too Many Requests' });

      await jest.advanceTimersByTimeAsync(1000); // avança o delay do retry 1

      // Tentativa 2 (retry 1)
      httpMock.expectOne((r) => r.url.includes('/coins/markets'))
        .flush({ error: 'rate limited' }, { status: 429, statusText: 'Too Many Requests' });

      await jest.advanceTimersByTimeAsync(1000); // avança o delay do retry 2

      // Tentativa 3 (retry 2 — final)
      httpMock.expectOne((r) => r.url.includes('/coins/markets'))
        .flush({ error: 'rate limited' }, { status: 429, statusText: 'Too Many Requests' });

      expect(capturedError.status).toBe(429);
      expect(capturedError.message).toContain('Limite de requisições');

      jest.useRealTimers();
    });

    it('should emit an ApiError with a connectivity message on status 0', async () => {
      jest.useFakeTimers();
      let capturedError: any;

      service.getMarketPrices().subscribe({ error: (err) => (capturedError = err) });

      // Tentativa 1
      httpMock.expectOne((r) => r.url.includes('/coins/markets'))
        .flush(null, { status: 0, statusText: 'Unknown Error' });

      await jest.advanceTimersByTimeAsync(1000);

      // Tentativa 2
      httpMock.expectOne((r) => r.url.includes('/coins/markets'))
        .flush(null, { status: 0, statusText: 'Unknown Error' });

      await jest.advanceTimersByTimeAsync(1000);

      // Tentativa 3 (final)
      httpMock.expectOne((r) => r.url.includes('/coins/markets'))
        .flush(null, { status: 0, statusText: 'Unknown Error' });

      expect(capturedError.status).toBe(0);
      expect(capturedError.message).toContain('Sem conexão');

      jest.useRealTimers();
    });
  });
});
