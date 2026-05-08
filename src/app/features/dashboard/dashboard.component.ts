import { Component, computed, inject, OnInit, ChangeDetectionStrategy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title, Meta } from '@angular/platform-browser';
import { interval, of } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';

import { loadPrices, addToWatchlist } from 'app/store/watchlist/watchlist.actions';
import {
  selectAllAssets,
  selectLoading,
  selectError,
  selectPortfolioSummary,
  selectLastUpdated,
  selectCooldownUntil,
  selectIsCooldown,
} from 'app/store/watchlist/watchlist.selectors';
import { DatePipe } from '@angular/common';
import { AssetCardComponent } from './components/asset-card/asset-card.component';
import { PortfolioSummaryComponent } from './components/portfolio-summary/portfolio-summary.component';
import { SkeletonComponent } from 'app/shared/components/skeleton/skeleton.component';
import { LogoComponent } from 'app/shared/components/logo/logo.component';
import { RefreshCountdownComponent } from './components/refresh-countdown/refresh-countdown.component';
import type { WatchlistAsset } from 'app/core/interfaces/coin.interface';

/**
 * Smart Component — único ponto de contato com o Store nesta feature.
 * Delega renderização para Dumb Components (AssetCard, PortfolioSummary).
 *
 * Princípio DIP (Dependency Inversion Principle — Inversão de Dependência):
 * Este componente depende da abstração `Store` injetada pelo Angular DI,
 * nunca de implementations concretas de HTTP. Trocar o backend ou mockar
 * o estado em testes não exige alterar esta classe.
 */
@Component({
  selector: 'bc-dashboard',
  standalone: true,
  imports: [DatePipe, AssetCardComponent, PortfolioSummaryComponent, SkeletonComponent, LogoComponent, RefreshCountdownComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private readonly store     = inject(Store);
  private readonly titleSvc  = inject(Title);
  private readonly metaSvc   = inject(Meta);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // Signals derivados dos seletores NgRx — integração via toSignal()
  readonly assets           = toSignal(this.store.select(selectAllAssets), { initialValue: [] });
  readonly loading          = toSignal(this.store.select(selectLoading), { initialValue: false });
  readonly error            = toSignal(this.store.select(selectError), { initialValue: null });
  readonly portfolioSummary = toSignal(this.store.select(selectPortfolioSummary));
  readonly lastUpdated      = toSignal(this.store.select(selectLastUpdated), { initialValue: null });
  readonly cooldownUntil    = toSignal(this.store.select(selectCooldownUntil), { initialValue: null });
  readonly isCooldown       = toSignal(this.store.select(selectIsCooldown), { initialValue: false });

  /** Segundos restantes de cooldown, decrescendo a cada 1s (browser only) */
  readonly cooldownRemaining = toSignal(
    this.isBrowser
      ? this.store.select(selectCooldownUntil).pipe(
          switchMap((until) =>
            !until
              ? of(0)
              : interval(1000).pipe(
                  startWith(0),
                  map(() => Math.max(0, Math.ceil((until - Date.now()) / 1000))),
                ),
          ),
        )
      : of(0),
    { initialValue: 0 },
  );

  /** "M:SS" formatado para exibição no banner de cooldown */
  readonly cooldownDisplay = computed(() => {
    const secs = this.cooldownRemaining();
    const m    = Math.floor(secs / 60);
    const s    = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  });

  /** Array de skeletons para o estado de carregamento inicial */
  readonly skeletonItems = Array.from({ length: 6 });

  ngOnInit(): void {
    this.titleSvc.setTitle('BXZZ Capital — Gestão de Ativos Digitais');
    this.metaSvc.updateTag({ name: 'description',        content: 'Acompanhe sua carteira de criptomoedas em tempo real com BXZZ Capital.' });
    this.metaSvc.updateTag({ property: 'og:title',       content: 'BXZZ Capital — Gestão de Ativos Digitais' });
    this.metaSvc.updateTag({ property: 'og:description', content: 'Acompanhe sua carteira de criptomoedas em tempo real.' });
    this.metaSvc.updateTag({ property: 'og:url',         content: 'https://alefsilva.github.io/bxzz-capital/' });
    this.seedInitialWatchlist();
    this.store.dispatch(loadPrices());
  }

  /**
   * Popula a watchlist com ativos padrão na primeira carga.
   * Em produção, isso viria de uma API de portfólio do usuário.
   */
  private seedInitialWatchlist(): void {
    const defaults: Pick<WatchlistAsset, 'id' | 'purchasePrice' | 'quantity'>[] = [
      { id: 'bitcoin',   purchasePrice: 42000, quantity: 0.5  },
      { id: 'ethereum',  purchasePrice: 2200,  quantity: 2    },
      { id: 'solana',    purchasePrice: 85,    quantity: 10   },
      { id: 'cardano',   purchasePrice: 0.45,  quantity: 1000 },
      { id: 'polkadot',  purchasePrice: 6.5,   quantity: 50   },
      { id: 'chainlink', purchasePrice: 12,    quantity: 30   },
    ];

    defaults.forEach(({ id, purchasePrice, quantity }) => {
      const asset = {
        id,
        symbol:                           id,
        name:                             id,
        image:                            '',
        current_price:                    0,
        market_cap:                       0,
        market_cap_rank:                  0,
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
        purchasePrice,
        quantity,
        addedAt: Date.now(),
      } satisfies WatchlistAsset;

      this.store.dispatch(addToWatchlist({ asset }));
    });
  }
}
