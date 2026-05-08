import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';

import { RefreshCountdownComponent } from './refresh-countdown.component';
import { initialWatchlistState } from 'app/store/watchlist/watchlist.state';
import { selectLastUpdated, selectLoading } from 'app/store/watchlist/watchlist.selectors';

describe('RefreshCountdownComponent', () => {
  let fixture:   ComponentFixture<RefreshCountdownComponent>;
  let component: RefreshCountdownComponent;
  let store:     MockStore;

  function text(): string {
    return (fixture.nativeElement as HTMLElement)
      .querySelector('.bxzz-capital-refresh-countdown__text')!
      .textContent!.trim();
  }

  function container(): Element {
    return (fixture.nativeElement as HTMLElement)
      .querySelector('.bxzz-capital-refresh-countdown')!;
  }

  function setStore(lastUpdated: number | null, loading = false): void {
    store.overrideSelector(selectLastUpdated, lastUpdated);
    store.overrideSelector(selectLoading, loading);
    store.refreshState();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    jest.useFakeTimers();

    await TestBed.configureTestingModule({
      imports: [RefreshCountdownComponent],
      providers: [
        provideMockStore({ initialState: { watchlist: initialWatchlistState } }),
      ],
    }).compileComponents();

    store     = TestBed.inject(MockStore);
    fixture   = TestBed.createComponent(RefreshCountdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ─── countdown signal ────────────────────────────────────────────────────────

  describe('countdown signal', () => {
    it('should be 0 when lastUpdated is null', () => {
      setStore(null);
      expect(component.countdown()).toBe(0);
    });

    it('should compute remaining seconds from lastUpdated', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 270_000); // 270s atrás → 30s restantes (TTL = 300s)
      expect(component.countdown()).toBe(30);
    });

    it('should clamp to 0 when cache is expired', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 305_000); // 305s atrás — expirado (TTL = 300s)
      expect(component.countdown()).toBe(0);
    });

    it('should reset when lastUpdated changes', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);

      setStore(now - 270_000);
      expect(component.countdown()).toBe(30);

      setStore(now);
      expect(component.countdown()).toBe(300);
    });

    it('should decrement as time passes via interval', () => {
      const start = 1_000_000_000_000;
      let   now   = start;
      jest.spyOn(Date, 'now').mockImplementation(() => now);

      setStore(start - 260_000); // 40s remaining
      expect(component.countdown()).toBe(40);

      now = start + 10_000; // 10s later → 30s remaining
      jest.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(component.countdown()).toBe(30);
    });
  });

  // ─── isUrgent computed ───────────────────────────────────────────────────────

  describe('isUrgent computed', () => {
    it('should be false when countdown > 5 and not loading', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 50_000); // 250s remaining — não urgente
      expect(component.isUrgent()).toBe(false);
    });

    it('should be true when countdown <= 5 and not loading', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 297_000); // 3s remaining — urgente
      expect(component.isUrgent()).toBe(true);
    });

    it('should be false when loading even with countdown <= 5', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 297_000, true);
      expect(component.isUrgent()).toBe(false);
    });
  });

  // ─── dashOffset computed ─────────────────────────────────────────────────────

  describe('dashOffset computed', () => {
    it('should be ~0 when at full 300s', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now);
      expect(component.dashOffset()).toBeCloseTo(0, 0);
    });

    it('should be ~CIRCUMFERENCE when at 0s (expired)', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 305_000); // expirado
      expect(component.dashOffset()).toBeCloseTo(component.CIRCUMFERENCE, 1);
    });

    it('should be ~half CIRCUMFERENCE at 150s remaining (half of 300s TTL)', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 150_000); // 150s restantes = metade do TTL
      expect(component.dashOffset()).toBeCloseTo(component.CIRCUMFERENCE / 2, 0);
    });
  });

  // ─── template ────────────────────────────────────────────────────────────────

  describe('template', () => {
    it('should show "Sincronizando..." when loading is true', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 10_000, true);
      expect(text()).toContain('Sincronizando');
    });

    it('should show countdown text when not loading and countdown > 0', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 270_000); // 30s restantes
      expect(text()).toContain('00:30');
    });

    it('should show "Sincronizando..." when countdown is 0', () => {
      setStore(null);
      expect(text()).toContain('Sincronizando');
    });

    it('should apply --urgent modifier when countdown <= 5', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 297_000); // 3s remaining
      expect(container().classList).toContain('bxzz-capital-refresh-countdown--urgent');
    });

    it('should apply --syncing modifier when loading', () => {
      setStore(null, true);
      expect(container().classList).toContain('bxzz-capital-refresh-countdown--syncing');
    });

    it('should NOT apply --urgent modifier when loading', () => {
      const now = 1_000_000_000_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      setStore(now - 297_000, true);
      expect(container().classList).not.toContain('bxzz-capital-refresh-countdown--urgent');
    });
  });
});
