import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CurrencyPipe, DecimalPipe, NgClass, UpperCasePipe } from '@angular/common';

import type { WatchlistAsset } from '../../../../core/interfaces/coin.interface';

/**
 * Princípio SRP: renderiza apenas os dados de um único ativo.
 * Não conhece o Store — recebe dados via input() e emite eventos via output().
 * ChangeDetectionStrategy.OnPush: só re-renderiza quando o input muda de referência,
 * o que funciona perfeitamente com o fluxo imutável do NgRx.
 */
@Component({
  selector: 'bc-asset-card',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, NgClass, UpperCasePipe],
  templateUrl: './asset-card.component.html',
  styleUrl: './asset-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetCardComponent {
  readonly asset = input.required<WatchlistAsset>();

  // Signal derivado: calculado localmente apenas para dados de exibição
  readonly priceChangeClass = computed(() =>
    this.asset().price_change_percentage_24h >= 0
      ? 'b-capital-asset-card__change--up'
      : 'b-capital-asset-card__change--down',
  );

  readonly priceChangeSign = computed(() =>
    this.asset().price_change_percentage_24h >= 0 ? '+' : '',
  );

  readonly investedValue = computed(() =>
    this.asset().purchasePrice * this.asset().quantity,
  );

  readonly currentValue = computed(() =>
    this.asset().current_price * this.asset().quantity,
  );

  readonly profitLoss = computed(() => this.currentValue() - this.investedValue());

  readonly profitLossClass = computed(() =>
    this.profitLoss() >= 0
      ? 'b-capital-asset-card__pnl--positive'
      : 'b-capital-asset-card__pnl--negative',
  );
}
