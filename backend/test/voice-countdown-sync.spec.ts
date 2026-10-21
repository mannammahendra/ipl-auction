import { describe, it, expect, beforeEach } from 'vitest';

export type SpeechPriority = 'COUNTDOWN' | 'BID' | 'NOMINATION' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  COUNTDOWN: 1,
  BID: 2,
  NOMINATION: 3,
  RESULT: 4,
};

// Pure logic mirror of AuctioneerVoiceService priority, Blitz rate scaling, and speech lifecycle
class AuctioneerVoiceLogicTestHarness {
  public enabled: boolean = true;
  public rate: number = 1.0; // Natural 1x base speech rate
  public activeTimerSpeed: number = 1.0;
  public spokenUtterances: { text: string; priority: SpeechPriority; rate: number }[] = [];
  public cancelledCount: number = 0;
  public lastAnnouncedCountdownNumber: number | null = null;
  public lastAnnouncedCountdownLotId: string | null = null;
  public lastAnnouncedBidKey: string | null = null;
  public currentPriority: SpeechPriority | null = null;
  public isSpeakingActive: boolean = false;
  public announcedNominationLots = new Set<string>();

  public setTimerSpeed(speedMultiplier: number): void {
    if (speedMultiplier && speedMultiplier >= 1.0) {
      this.activeTimerSpeed = speedMultiplier;
      // Discard obsolete countdown when Blitz speed changes
      if (this.currentPriority === 'COUNTDOWN') {
        this.stopCountdown();
      }
    }
  }

  public resetCountdown(): void {
    this.lastAnnouncedCountdownNumber = null;
  }

  public stopCountdown(): void {
    this.resetCountdown();
    if (this.currentPriority === 'COUNTDOWN') {
      this.isSpeakingActive = false;
      this.currentPriority = null;
      this.cancelledCount++;
    }
  }

  public stop(): void {
    this.isSpeakingActive = false;
    this.currentPriority = null;
    this.resetCountdown();
    this.lastAnnouncedBidKey = null;
    this.cancelledCount++;
  }

  public getCountdownSpokenText(seconds: number): string | null {
    if (seconds >= 0 && seconds <= 5) {
      return String(seconds);
    }
    return null;
  }

  public computeDynamicRate(priority: SpeechPriority, speedMultiplier?: number): number {
    const base = this.rate || 1.0;
    if (priority === 'COUNTDOWN') {
      const mult = Math.max(1.0, speedMultiplier || this.activeTimerSpeed || 1.0);
      const computed = parseFloat((base * mult).toFixed(2));
      return Math.min(2.5, Math.max(1.0, computed));
    }
    return base;
  }

  public formatRupeesSpoken(amount: number): string {
    if (!amount || amount <= 0) return '0';
    if (amount >= 10000000) {
      const cr = amount / 10000000;
      if (cr % 1 === 0) return `${cr} Crore`;
      return `${parseFloat(cr.toFixed(2))} Crore`;
    }
    if (amount >= 100000) {
      return `${Math.round(amount / 100000)} Lakh`;
    }
    return `${amount} rupees`;
  }

  public speak(
    text: string,
    priority: SpeechPriority = 'BID',
    overrideRate?: number,
    speedMultiplier?: number
  ) {
    if (!this.enabled) return;

    if (priority === 'NOMINATION') {
      this.currentPriority = 'NOMINATION';
    } else if (priority === 'RESULT') {
      this.currentPriority = 'RESULT';
    } else if (priority === 'BID') {
      if (this.currentPriority === 'RESULT') {
        return;
      }
      this.currentPriority = 'BID';
    } else if (priority === 'COUNTDOWN') {
      if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'RESULT') {
        return;
      }
      if (this.currentPriority === 'COUNTDOWN' && this.isSpeakingActive) {
        return; // Skip outdated number
      }
      this.currentPriority = 'COUNTDOWN';
    }

    const effectiveRate = overrideRate !== undefined
      ? overrideRate
      : this.computeDynamicRate(priority, speedMultiplier);

    this.isSpeakingActive = true;
    this.spokenUtterances.push({
      text,
      priority,
      rate: effectiveRate,
    });
  }

  public simulateUtteranceEnd() {
    this.isSpeakingActive = false;
    this.currentPriority = null;
  }

  public announceNomination(playerName: string, role?: string, lotId?: string) {
    if (!this.enabled) return;

    if (lotId && this.announcedNominationLots.has(lotId)) {
      return;
    }
    if (lotId) {
      this.announcedNominationLots.add(lotId);
      if (this.announcedNominationLots.size > 200) {
        const first = this.announcedNominationLots.values().next().value;
        if (first) this.announcedNominationLots.delete(first);
      }
    }

    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
    this.lastAnnouncedCountdownLotId = lotId || null;

    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    const roles: Record<string, string> = {
      BATSMAN: 'Batsman',
      BOWLER: 'Bowler',
      ALL_ROUNDER: 'All-Rounder',
      WICKET_KEEPER: 'Wicket-Keeper',
    };
    const roleNormalized = role ? (roles[role.toUpperCase()] || role) : 'Batsman';
    const text = `${cleanPlayer}, ${roleNormalized}.`;
    this.speak(text, 'NOMINATION');
  }

  public announceBid(teamShortName: string, amount: number, lotId?: string) {
    if (!amount || amount <= 0) return;
    this.stopCountdown();

    const cleanTeam = teamShortName.toUpperCase().trim();
    const bidKey = `${lotId || 'current'}_${cleanTeam}_${amount}`;
    if (this.lastAnnouncedBidKey === bidKey) {
      return;
    }
    this.lastAnnouncedBidKey = bidKey;

    const price = this.formatRupeesSpoken(amount);
    this.speak(`${cleanTeam} ${price}`, 'BID');
  }

  public announceCountdown(seconds: number, lotId?: string, speedMultiplier?: number) {
    if (!this.enabled || seconds < 0 || seconds > 5) return;

    if (speedMultiplier && speedMultiplier >= 1.0) {
      this.activeTimerSpeed = speedMultiplier;
    }

    if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'RESULT') {
      return;
    }

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

    if (this.currentPriority === 'COUNTDOWN' && this.isSpeakingActive) {
      return; // Skip outdated number
    }

    this.lastAnnouncedCountdownNumber = seconds;
    const spokenText = this.getCountdownSpokenText(seconds);
    if (spokenText) {
      const mult = speedMultiplier || this.activeTimerSpeed || 1.0;
      const rate = this.computeDynamicRate('COUNTDOWN', mult);
      this.speak(spokenText, 'COUNTDOWN', rate, mult);
    }
  }

  public announceSold(playerName: string, teamName: string, amount: number) {
    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
    const price = this.formatRupeesSpoken(amount);
    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    const cleanTeam = teamName && teamName.trim() ? teamName.trim() : 'Winning Franchise';
    this.speak(`Sold! ${cleanPlayer} to ${cleanTeam} for ${price}!`, 'RESULT');
  }

  public announceUnsold(playerName?: string) {
    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    this.speak(`${cleanPlayer} unsold.`, 'RESULT');
  }
}

describe('Auction Voice & Blitz Countdown Synchronization Test Suite', () => {
  let harness: AuctioneerVoiceLogicTestHarness;

  beforeEach(() => {
    harness = new AuctioneerVoiceLogicTestHarness();
  });

  describe('1. Countdown Acceleration Across Blitz Modes', () => {
    it('schedules Normal countdown (1x) with 1.0x rate', () => {
      harness.announceCountdown(5, 'lot-1', 1.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('5');
      expect(harness.spokenUtterances[0].rate).toBe(1.0);
    });

    it('schedules Blitz 1.25x countdown with 1.25x faster speech rate', () => {
      harness.announceCountdown(5, 'lot-1', 1.25);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('5');
      expect(harness.spokenUtterances[0].rate).toBe(1.25);
    });

    it('schedules Blitz 1.5x countdown with 1.5x faster speech rate', () => {
      harness.announceCountdown(5, 'lot-1', 1.5);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('5');
      expect(harness.spokenUtterances[0].rate).toBe(1.5);
    });

    it('schedules Blitz 2x countdown with 2.0x faster speech rate', () => {
      harness.announceCountdown(5, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('5');
      expect(harness.spokenUtterances[0].rate).toBe(2.0);
    });
  });

  describe('2. Important Announcements Preserved at Natural 1.0x Rate', () => {
    it('speaks player nomination at natural 1.0x rate even when 2.0x Blitz is active', () => {
      harness.setTimerSpeed(2.0);
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');

      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli, Batsman.');
      expect(harness.spokenUtterances[0].priority).toBe('NOMINATION');
      expect(harness.spokenUtterances[0].rate).toBe(1.0); // Preserved at natural 1.0x
    });

    it('speaks live bid at natural 1.0x rate even when 2.0x Blitz is active', () => {
      harness.setTimerSpeed(2.0);
      harness.announceBid('RCB', 210000000, 'lot-1');

      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('RCB 21 Crore');
      expect(harness.spokenUtterances[0].priority).toBe('BID');
      expect(harness.spokenUtterances[0].rate).toBe(1.0); // Preserved at natural 1.0x
    });

    it('speaks confirmed sale at natural 1.0x rate even when 2.0x Blitz is active', () => {
      harness.setTimerSpeed(2.0);
      harness.announceSold('Virat Kohli', 'Royal Challengers Bengaluru', 210000000);

      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Sold! Virat Kohli to Royal Challengers Bengaluru for 21 Crore!');
      expect(harness.spokenUtterances[0].priority).toBe('RESULT');
      expect(harness.spokenUtterances[0].rate).toBe(1.0); // Preserved at natural 1.0x
    });

    it('speaks unsold announcement at natural 1.0x rate even when 2.0x Blitz is active', () => {
      harness.setTimerSpeed(2.0);
      harness.announceUnsold('Steve Smith');

      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Steve Smith unsold.');
      expect(harness.spokenUtterances[0].priority).toBe('RESULT');
      expect(harness.spokenUtterances[0].rate).toBe(1.0); // Preserved at natural 1.0x
    });
  });

  describe('3. Dynamic Speed Changes & Mid-Countdown Invalidation', () => {
    it('immediately cancels obsolete countdown speech when Blitz speed changes mid-countdown', () => {
      harness.announceCountdown(3, 'lot-1', 1.0);
      expect(harness.currentPriority).toBe('COUNTDOWN');
      expect(harness.cancelledCount).toBe(0);

      // Speed changed to 2.0x Blitz by host
      harness.setTimerSpeed(2.0);
      expect(harness.cancelledCount).toBe(1);
      expect(harness.currentPriority).toBeNull();
      expect(harness.activeTimerSpeed).toBe(2.0);

      // Next tick immediately adopts the new 2.0x Blitz rate
      harness.announceCountdown(2, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('2');
      expect(harness.spokenUtterances[1].rate).toBe(2.0);
    });
  });

  describe('4. Real-Time Countdown Synchronization & Outdated Number Skipping', () => {
    it('skips outdated countdown numbers when an utterance cannot finish before next tick', () => {
      // Tick 5 begins speaking at 2.0x Blitz
      harness.announceCountdown(5, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('5');

      // Tick 4 arrives before 5 finishes: 4 is skipped to prevent lag and drift
      harness.announceCountdown(4, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(1); // 4 skipped!

      // 5 finishes speaking
      harness.simulateUtteranceEnd();

      // Tick 3 arrives: voice is free and speaks 3
      harness.announceCountdown(3, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('3');

      // 3 finishes speaking
      harness.simulateUtteranceEnd();

      // Tick 2 arrives: speaks 2
      harness.announceCountdown(2, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(3);
      expect(harness.spokenUtterances[2].text).toBe('2');
    });

    it('drops duplicate and out-of-order stale ticks', () => {
      harness.announceCountdown(5, 'lot-1', 1.0);
      harness.simulateUtteranceEnd();

      harness.announceCountdown(5, 'lot-1', 1.0); // Duplicate
      harness.announceCountdown(3, 'lot-1', 1.0); // Skipped 4
      harness.simulateUtteranceEnd();

      harness.announceCountdown(4, 'lot-1', 1.0); // Stale / out of order

      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['5', '3']);
    });
  });

  describe('5. Safety & Transition Protection', () => {
    it('new player nomination is NOT blocked by earlier lot sale result', () => {
      harness.announceSold('Rohit Sharma', 'Mumbai Indians', 160000000);
      expect(harness.currentPriority).toBe('RESULT');

      harness.announceNomination('Jasprit Bumrah', 'BOWLER', 'lot-2');
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('Jasprit Bumrah, Bowler.');
      expect(harness.spokenUtterances[1].priority).toBe('NOMINATION');
    });

    it('new bid immediately cancels active countdown', () => {
      harness.announceCountdown(2, 'lot-1', 1.5);
      expect(harness.currentPriority).toBe('COUNTDOWN');

      harness.announceBid('CSK', 50000000, 'lot-1');
      expect(harness.cancelledCount).toBe(1);
      expect(harness.currentPriority).toBe('BID');
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['2', 'CSK 5 Crore']);
    });

    it('mute suppresses all vocalization', () => {
      harness.enabled = false;
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      harness.announceCountdown(5, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(0);
    });
  });
});
