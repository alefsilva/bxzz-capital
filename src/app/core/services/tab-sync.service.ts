import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, interval, Observable, Subject } from 'rxjs';
import { distinctUntilChanged, takeWhile } from 'rxjs/operators';

import type { CoinMarket } from '@src/app/core/interfaces/coin.interface';

// ─── Message Types ────────────────────────────────────────────────────────────

export type TabMessage =
  | { type: 'heartbeat';            tabId: string }
  | { type: 'prices-updated';       coins: CoinMarket[]; lastUpdated: number }
  | { type: 'cooldown-started';     cooldownUntil: number }
  | { type: 'leader-stepping-down'; tabId: string };

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TabSyncService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly CHANNEL_NAME   = 'bxzz-capital-sync';
  private readonly LEADER_KEY     = 'bxzz-leader-id';
  private readonly LEADER_TS_KEY  = 'bxzz-leader-ts';
  private readonly HEARTBEAT_MS   = 10_000;
  private readonly LEADER_TIMEOUT = 15_000;

  private readonly tabId = this.isBrowser
    ? crypto.randomUUID()
    : 'ssg-build';

  private channel: BroadcastChannel | null = null;

  private readonly _isLeader$ = new BehaviorSubject(false);
  private readonly _messages$ = new Subject<TabMessage>();

  readonly isLeader$: Observable<boolean> = this._isLeader$.asObservable().pipe(distinctUntilChanged());
  readonly messages$: Observable<TabMessage> = this._messages$.asObservable();

  get isLeader(): boolean {
    return this._isLeader$.value;
  }

  /**
   * Chamado via afterNextRender() nos Effects — garante que BroadcastChannel
   * e localStorage só são acessados no browser em runtime, nunca durante
   * a pré-renderização SSG no Node.js (build time).
   */
  init(): void {
    if (!this.isBrowser) return;

    this.channel = new BroadcastChannel(this.CHANNEL_NAME);
    this.channel.onmessage = ({ data }: MessageEvent) => this.handleMessage(data);

    this.tryClaimLeadership();

    window.addEventListener('beforeunload', () => this.onBeforeUnload());
  }

  broadcast(msg: TabMessage): void {
    this.channel?.postMessage(msg);
  }

  private handleMessage(data: unknown): void {
    if (!this.isValidTabMessage(data)) return;

    this._messages$.next(data);

    if (data.type === 'heartbeat') {
      // Outra aba já é líder; se esta também reivindicou liderança (colisão),
      // o tabId menor ganha — resolve race condition sem coordenação externa
      if (this._isLeader$.value && data.tabId < this.tabId) {
        this._isLeader$.next(false);
      }
    } else if (data.type === 'leader-stepping-down') {
      this.electNewLeader();
    }
  }

  private isValidTabMessage(data: unknown): data is TabMessage {
    if (!data || typeof data !== 'object') return false;
    const msg = data as Record<string, unknown>;
    switch (msg['type']) {
      case 'heartbeat':            return typeof msg['tabId'] === 'string';
      case 'prices-updated':       return Array.isArray(msg['coins']) && typeof msg['lastUpdated'] === 'number';
      case 'cooldown-started':     return typeof msg['cooldownUntil'] === 'number';
      case 'leader-stepping-down': return typeof msg['tabId'] === 'string';
      default: return false;
    }
  }

  private tryClaimLeadership(): void {
    const leaderId  = localStorage.getItem(this.LEADER_KEY);
    const leaderTs  = Number(localStorage.getItem(this.LEADER_TS_KEY) ?? 0);
    const leaderAlive = !!leaderId && (Date.now() - leaderTs < this.LEADER_TIMEOUT);

    if (!leaderAlive) {
      this.claimLeadership();
    }
  }

  private claimLeadership(): void {
    localStorage.setItem(this.LEADER_KEY, this.tabId);
    localStorage.setItem(this.LEADER_TS_KEY, String(Date.now()));
    this._isLeader$.next(true);
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    interval(this.HEARTBEAT_MS)
      .pipe(takeWhile(() => this._isLeader$.value))
      .subscribe(() => {
        if (!this._isLeader$.value) return;
        localStorage.setItem(this.LEADER_TS_KEY, String(Date.now()));
        this.channel?.postMessage(
          { type: 'heartbeat', tabId: this.tabId } satisfies TabMessage,
        );
      });
  }

  private electNewLeader(): void {
    // Delay aleatório 500–1500 ms evita que todas as seguidoras reclamem
    // liderança simultaneamente quando a líder fecha (thundering herd)
    setTimeout(() => {
      const leaderId  = localStorage.getItem(this.LEADER_KEY);
      const leaderTs  = Number(localStorage.getItem(this.LEADER_TS_KEY) ?? 0);
      const leaderAlive = !!leaderId && (Date.now() - leaderTs < this.LEADER_TIMEOUT);

      if (!leaderAlive) {
        this.claimLeadership();
      }
    }, Math.random() * 1000 + 500);
  }

  private onBeforeUnload(): void {
    if (!this._isLeader$.value) return;
    this.channel?.postMessage(
      { type: 'leader-stepping-down', tabId: this.tabId } satisfies TabMessage,
    );
    localStorage.removeItem(this.LEADER_KEY);
    localStorage.removeItem(this.LEADER_TS_KEY);
  }
}
