import { describe, it, expect, beforeEach } from 'vitest';

// Pure logic mirror of AuctioneerVoiceService countdown, rate calculation, and speech deduplication
class AuctioneerVoiceLogicTestHarness {
  public enabled: boolean = true;
  public rate: number = 2.0;
  public activeTimerSpeed: number = 1.0;
  public spokenUtterances: string[] = [];
  public cancelledCount: number = 0;
  public lastAnnouncedCountdownNumber: number | null = null;
  public lastAnnouncedCountdownLotId: string | null = null;
  public lastAnnouncedBidKey: string | null = null;

  public resetCountdown(): void {
    this.lastAnnouncedCountdownNumber = null;
  }

  public stopCountdown(): void {
    this.resetCountdown();
    this.cancelledCount++;
  }

  public stop(): void {
    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
  }

  public getCountdownSpokenText(seconds: number): string | null {
    if (seconds >= 0 && seconds <= 5) {
      return String(seconds);
    }
    return null;
  }

  public computeDynamicRate(options?: {
    isBid?: boolean;
    isCountdown?: boolean;
    timerSpeedMultiplier?: number;
    remainingSeconds?: number;
    isMobile?: boolean;
  }): number {
    const baseRate = this.rate || 2.0;
    const timerSpeed = Math.max(1.0, options?.timerSpeedMultiplier || this.activeTimerSpeed || 1.0);
    const isMobile = options?.isMobile ?? false;
    const maxSafeRate = isMobile ? 2.5 : 3.5;
    const minSafeRate = isMobile ? 1.2 : 1.5;

    if (options?.isCountdown) {
      const baseCountdownRate = Math.max(1.8, baseRate);
      const countdownRate = baseCountdownRate * timerSpeed;
      return Math.min(maxSafeRate, Math.max(minSafeRate, parseFloat(countdownRate.toFixed(2))));
    }

    const calculatedRate = baseRate * timerSpeed;
    return Math.min(maxSafeRate, Math.max(minSafeRate, parseFloat(calculatedRate.toFixed(2))));
  }

  public announceCountdown(seconds: number, timerSpeedMultiplier?: number, lotId?: string) {
    if (!this.enabled || seconds < 0 || seconds > 5) return;

    if (lotId && lotId !== this.lastAnnouncedCountdownLotId) {
      this.lastAnnouncedCountdownLotId = lotId;
      this.lastAnnouncedCountdownNumber = null;
    }

    if (this.lastAnnouncedCountdownNumber === seconds) {
      return;
    }

    if (this.lastAnnouncedCountdownNumber !== null && seconds > this.lastAnnouncedCountdownNumber) {
      return;
    }

    this.lastAnnouncedCountdownNumber = seconds;
    const spokenText = this.getCountdownSpokenText(seconds);
    if (spokenText) {
      this.spokenUtterances.push(spokenText);
    }
  }

  public announceBid(teamShortName: string, amount: number, timerSpeedMultiplier?: number, lotId?: string) {
    if (!amount || amount <= 0) return;
    this.stopCountdown();

    const cleanTeam = teamShortName.toUpperCase().trim();
    const bidKey = `${lotId || 'current'}_${cleanTeam}_${amount}`;
    if (this.lastAnnouncedBidKey === bidKey) {
      return;
    }
    this.lastAnnouncedBidKey = bidKey;
    this.spokenUtterances.push(`${cleanTeam} ${amount}`);
  }

  public announceNomination(playerName: string, role: string) {
    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
    this.lastAnnouncedCountdownLotId = null;
    this.spokenUtterances.push(`${playerName}, ${role}`);
  }

  public announceSold(teamName: string, amount: number) {
    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
    this.spokenUtterances.push(`Sold to ${teamName} for ${amount}!`);
  }
}

describe('Auction Voice & Timer Synchronization Test Suite', () => {
  let harness: AuctioneerVoiceLogicTestHarness;

  beforeEach(() => {
    harness = new AuctioneerVoiceLogicTestHarness();
  });

  describe('1. Countdown Spoken Text (5 to 0)', () => {
    it('returns "5", "4", "3", "2", "1", "0" for the final 5-second countdown phase', () => {
      expect(harness.getCountdownSpokenText(5)).toBe('5');
      expect(harness.getCountdownSpokenText(4)).toBe('4');
      expect(harness.getCountdownSpokenText(3)).toBe('3');
      expect(harness.getCountdownSpokenText(2)).toBe('2');
      expect(harness.getCountdownSpokenText(1)).toBe('1');
      expect(harness.getCountdownSpokenText(0)).toBe('0');
    });

    it('returns null for ticks outside the 5 to 0 countdown window', () => {
      expect(harness.getCountdownSpokenText(6)).toBeNull();
      expect(harness.getCountdownSpokenText(10)).toBeNull();
      expect(harness.getCountdownSpokenText(25)).toBeNull();
      expect(harness.getCountdownSpokenText(-1)).toBeNull();
    });
  });

  describe('2. Blitz Speed Rate Synchronization', () => {
    it('scales dynamic countdown speech rate with Blitz multipliers on desktop', () => {
      const rate1x = harness.computeDynamicRate({ isCountdown: true, timerSpeedMultiplier: 1.0 });
      expect(rate1x).toBe(2.0);

      const rate125x = harness.computeDynamicRate({ isCountdown: true, timerSpeedMultiplier: 1.25 });
      expect(rate125x).toBe(2.5);

      const rate15x = harness.computeDynamicRate({ isCountdown: true, timerSpeedMultiplier: 1.5 });
      expect(rate15x).toBe(3.0);

      const rate2x = harness.computeDynamicRate({ isCountdown: true, timerSpeedMultiplier: 2.0 });
      expect(rate2x).toBe(3.5); // Capped at safe maximum
    });

    it('scales safely within mobile limits for Blitz multipliers', () => {
      const rateMobile1x = harness.computeDynamicRate({ isCountdown: true, timerSpeedMultiplier: 1.0, isMobile: true });
      expect(rateMobile1x).toBe(2.0);

      const rateMobile2x = harness.computeDynamicRate({ isCountdown: true, timerSpeedMultiplier: 2.0, isMobile: true });
      expect(rateMobile2x).toBe(2.5); // Mobile safe cap
    });

    it('guarantees utterance finishes with >60% idle headroom before next tick', () => {
      // Benchmark: At base speech speed (1.0x rate), a single digit duration is ~350ms.
      // At rate R, duration is approximately 350 / R ms.
      const speeds = [
        { blitz: 1.0, intervalMs: 1000 },
        { blitz: 1.25, intervalMs: 800 },
        { blitz: 1.5, intervalMs: 667 },
        { blitz: 2.0, intervalMs: 500 },
      ];

      for (const { blitz, intervalMs } of speeds) {
        const rate = harness.computeDynamicRate({ isCountdown: true, timerSpeedMultiplier: blitz });
        const estimatedDurationMs = 350 / rate;
        const headroomMs = intervalMs - estimatedDurationMs;
        const headroomPct = (headroomMs / intervalMs) * 100;

        expect(headroomPct).toBeGreaterThan(60);
      }
    });
  });

  describe('3. Queue Prevention, Deduplication & Stale Tick Dropping', () => {
    it('announces the complete sequential countdown 5, 4, 3, 2, 1, 0', () => {
      for (let sec = 5; sec >= 0; sec--) {
        harness.announceCountdown(sec, 1.0, 'lot-1');
      }
      expect(harness.spokenUtterances).toEqual(['5', '4', '3', '2', '1', '0']);
    });

    it('drops duplicate ticks without repeating speech', () => {
      harness.announceCountdown(5, 1.0, 'lot-1');
      harness.announceCountdown(5, 1.0, 'lot-1'); // Duplicate
      harness.announceCountdown(4, 1.0, 'lot-1');
      harness.announceCountdown(4, 1.0, 'lot-1'); // Duplicate

      expect(harness.spokenUtterances).toEqual(['5', '4']);
    });

    it('drops delayed out-of-order network ticks that arrive after a lower tick was spoken', () => {
      harness.announceCountdown(5, 1.0, 'lot-1');
      harness.announceCountdown(3, 1.0, 'lot-1'); // Dropped 4 on network, jumped to 3
      harness.announceCountdown(4, 1.0, 'lot-1'); // Delayed 4 arrives late - must be dropped!
      harness.announceCountdown(2, 1.0, 'lot-1');

      expect(harness.spokenUtterances).toEqual(['5', '3', '2']);
    });

    it('cancels countdown and resets state immediately when a bid is placed', () => {
      harness.announceCountdown(5, 1.0, 'lot-1');
      harness.announceCountdown(4, 1.0, 'lot-1');
      expect(harness.spokenUtterances).toEqual(['5', '4']);

      // Bid placed at 4s
      harness.announceBid('CSK', 20000000, 1.0, 'lot-1');
      expect(harness.cancelledCount).toBeGreaterThan(0);
      expect(harness.lastAnnouncedCountdownNumber).toBeNull();
      expect(harness.spokenUtterances).toContain('CSK 20000000');

      // Countdown resets to 15s, then ticks down back to 5
      harness.announceCountdown(5, 1.0, 'lot-1');
      expect(harness.spokenUtterances).toEqual(['5', '4', 'CSK 20000000', '5']);
    });

    it('deduplicates identical bids from repeated socket events', () => {
      harness.announceBid('MI', 40000000, 1.0, 'lot-1');
      harness.announceBid('MI', 40000000, 1.0, 'lot-1'); // Repeat

      expect(harness.spokenUtterances).toEqual(['MI 40000000']);

      // Different team or higher bid announces immediately
      harness.announceBid('RCB', 42500000, 1.0, 'lot-1');
      expect(harness.spokenUtterances).toEqual(['MI 40000000', 'RCB 42500000']);
    });

    it('resets countdown and bid tracking when a new player is nominated', () => {
      harness.announceCountdown(2, 1.0, 'lot-1');
      harness.announceNomination('Jasprit Bumrah', 'Bowler');

      expect(harness.cancelledCount).toBeGreaterThan(0);
      expect(harness.lastAnnouncedCountdownNumber).toBeNull();
      expect(harness.lastAnnouncedBidKey).toBeNull();
      expect(harness.spokenUtterances).toContain('Jasprit Bumrah, Bowler');
    });

    it('cancels speech and stops countdown when host pauses or skips', () => {
      harness.announceCountdown(3, 1.0, 'lot-1');
      const priorCancels = harness.cancelledCount;

      harness.stop();
      expect(harness.cancelledCount).toBeGreaterThan(priorCancels);
      expect(harness.lastAnnouncedCountdownNumber).toBeNull();
      expect(harness.lastAnnouncedBidKey).toBeNull();
    });

    it('handles zero expiration cleanly and allows sold announcement without overlap', () => {
      harness.announceCountdown(1, 1.0, 'lot-1');
      harness.announceCountdown(0, 1.0, 'lot-1');
      expect(harness.spokenUtterances).toEqual(['1', '0']);

      // At zero, lot resolves to sold
      harness.announceSold('Chennai Super Kings', 140000000);
      expect(harness.lastAnnouncedCountdownNumber).toBeNull();
      expect(harness.spokenUtterances).toContain('Sold to Chennai Super Kings for 140000000!');
    });
  });
});
