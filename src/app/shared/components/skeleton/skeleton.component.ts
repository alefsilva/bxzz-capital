import { Component, input } from '@angular/core';
import { NgClass } from '@angular/common';

export type SkeletonVariant = 'card' | 'line' | 'circle' | 'badge';

/**
 * Skeleton Screen performático.
 * Princípio SRP: responsabilidade única — renderizar placeholders de carregamento.
 * Animação em CSS puro via BEM — zero JavaScript, zero layout thrashing.
 */
@Component({
  selector: 'bc-skeleton',
  standalone: true,
  imports: [NgClass],
  templateUrl: './skeleton.component.html',
  styleUrl: './skeleton.component.scss',
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('card');
  readonly width   = input<'full' | 'wide' | 'narrow'>('wide');
}
