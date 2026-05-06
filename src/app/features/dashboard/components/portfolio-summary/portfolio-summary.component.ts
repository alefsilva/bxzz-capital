import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CurrencyPipe, DecimalPipe, NgClass } from '@angular/common';

import type { PortfolioSummary } from '../../../../core/interfaces/coin.interface';

/**
 * Princípio SRP: renderiza apenas o resumo consolidado do portfólio.
 * Recebe os dados prontos do Selector (via input), não acessa o Store diretamente.
 */
@Component({
  selector: 'bc-portfolio-summary',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, NgClass],
  templateUrl: './portfolio-summary.component.html',
  styleUrl: './portfolio-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortfolioSummaryComponent {
  readonly summary = input.required<PortfolioSummary>();

  readonly pnlClass = computed(() =>
    this.summary().totalProfitLoss >= 0
      ? 'bxzz-capital-portfolio-summary__pnl--positive'
      : 'bxzz-capital-portfolio-summary__pnl--negative',
  );

  readonly pnlSign = computed(() =>
    this.summary().totalProfitLoss >= 0 ? '+' : '',
  );
}
