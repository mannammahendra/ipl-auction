import { describe, it, expect, beforeEach } from 'vitest';

export type SpeechPriority = 'COUNTDOWN' | 'BID' | 'NOMINATION' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  COUNTDOWN: 1,
  BID: 2,
  NOMINATION: 3,
  RESULT: 4,
};

// Pure logic mirror of AuctioneerVoiceService priority, natural rate, and speech lifecycle
class AuctioneerVoiceLogicTestHarness {
  public enabled: boolean = true;
  public rate: number = 1.0; // Natural 1x intelligible speech rate
  public activeTimerSpeed: number = 1.0;
  public spokenUtterances: { text: string; priority: SpeechPriority; rate: number }[] = [];
  public cancelledCount: number = 0;
  public lastAnnouncedCountdownNumber: number | null = null;
  public lastAnnouncedCountdownLotId: string | null = null;
  public lastAnnouncedBidKey: string | null = null;
  public currentPriority: SpeechPriority | null = null;

  public resetCountdown(): void {
    this.lastAnnouncedCountdownNumber = null;
  }

  public stopCountdown(): void {
    this.resetCountdown();
    // Only cancel speech synthesis if countdown was the active speech
    if (this.currentPriority === 'COUNTDOWN') {
      this.currentPriority = null;
      this.cancelledCount++;
    }
  }

  public stop(): void {
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

  public computeDynamicRate(): number {
    // Decoupled from Blitz timer speed: always preserve natural, intelligible 1x speech rate
    return this.rate || 1.0;
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

  public speak(text: string, priority: SpeechPriority = 'BID') {
    if (!this.enabled) return;

    // Priority Check: If higher priority is active, do not interrupt
    if (this.currentPriority) {
      const activeRank = PRIORITY_ORDER[this.currentPriority];
      const newRank = PRIORITY_ORDER[priority];
      if (activeRank > newRank) {
        return; // Drop lower priority speech
      }
    }

    this.currentPriority = priority;
    this.spokenUtterances.push({
      text,
      priority,
      rate: this.computeDynamicRate(),
    });
  }

  public simulateUtteranceEnd() {
    this.currentPriority = null;
  }

  public announceNomination(playerName: string, role?: string) {
    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
    this.lastAnnouncedCountdownLotId = null;
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

  public announceCountdown(seconds: number, lotId?: string) {
    if (!this.enabled || seconds < 0 || seconds > 5) return;

    // Critical announcements take precedence: never interrupt nomination or sale results
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

    this.lastAnnouncedCountdownNumber = seconds;
    const spokenText = this.getCountdownSpokenText(seconds);
    if (spokenText) {
      this.speak(spokenText, 'COUNTDOWN');
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

describe('Auction Voice & Timer Synchronization Test Suite', () => {
  let harness: AuctioneerVoiceLogicTestHarness;

  beforeEach(() => {
    harness = new AuctioneerVoiceLogicTestHarness();
  });

  describe('1. Player & Franchise Announcements', () => {
    it('announces the player full name clearly on nomination', () => {
      harness.announceNomination('Virat Kohli', 'BATSMAN');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli, Batsman.');
      expect(harness.spokenUtterances[0].priority).toBe('NOMINATION');
      expect(harness.spokenUtterances[0].rate).toBe(1.0);
    });

    it('clearly announces the player name, winning franchise, and final amount on sale', () => {
      harness.announceSold('Virat Kohli', 'Royal Challengers Bengaluru', 210000000);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Sold! Virat Kohli to Royal Challengers Bengaluru for 21 Crore!');
      expect(harness.spokenUtterances[0].priority).toBe('RESULT');
      expect(harness.spokenUtterances[0].rate).toBe(1.0);
    });

    it('clearly announces unsold player when player is unsold', () => {
      harness.announceUnsold('Steve Smith');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Steve Smith unsold.');
      expect(harness.spokenUtterances[0].priority).toBe('RESULT');
    });
  });

  describe('2. Voice Speed Decoupling from Blitz Timer Speed', () => {
    it('maintains a natural 1.0x voice speech rate regardless of Blitz speed', () => {
      const blitzSpeeds = [1.0, 1.25, 1.5, 2.0];
      for (const speed of blitzSpeeds) {
        harness.activeTimerSpeed = speed;
        expect(harness.computeDynamicRate()).toBe(1.0);
      }
    });

    it('speaks player name, bids, sale amounts, and countdown at 1.0x rate at 2.0x Blitz', () => {
      harness.activeTimerSpeed = 2.0;

      harness.announceNomination('Jasprit Bumrah', 'BOWLER');
      harness.simulateUtteranceEnd();

      harness.announceBid('MI', 180000000, 'lot-1');
      harness.simulateUtteranceEnd();

      harness.announceCountdown(5, 'lot-1');
      harness.simulateUtteranceEnd();

      harness.announceSold('Jasprit Bumrah', 'Mumbai Indians', 180000000);

      for (const u of harness.spokenUtterances) {
        expect(u.rate).toBe(1.0);
      }
    });
  });

  describe('3. Priority Hierarchy & Protection Against Premature Cancellation', () => {
    it('does NOT let countdown ticks interrupt or cancel an active player nomination announcement', () => {
      // 1. Nomination starts speaking
      harness.announceNomination('Rohit Sharma', 'BATSMAN');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Rohit Sharma, Batsman.');

      // 2. Timer tick arrives at 5 seconds while nomination is speaking
      harness.announceCountdown(5, 'lot-1');

      // Countdown must be dropped/skipped; nomination must not be cut off!
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.currentPriority).toBe('NOMINATION');

      // 3. Once nomination finishes, countdown can speak
      harness.simulateUtteranceEnd();
      harness.announceCountdown(4, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('4');
    });

    it('does NOT let timer ticks (> 5s) cancel nomination or sale speech', () => {
      harness.announceNomination('MS Dhoni', 'WICKET_KEEPER');
      expect(harness.cancelledCount).toBe(0);

      // Simulating onTimerTick with 24s remaining (resetCountdown only)
      harness.resetCountdown();
      expect(harness.cancelledCount).toBe(0);
      expect(harness.currentPriority).toBe('NOMINATION');

      // Even if stopCountdown is called, it only cancels COUNTDOWN, not NOMINATION
      harness.stopCountdown();
      expect(harness.cancelledCount).toBe(0);
      expect(harness.currentPriority).toBe('NOMINATION');
    });

    it('does NOT let countdown ticks interrupt a confirmed sale announcement', () => {
      harness.announceSold('Rishabh Pant', 'Delhi Capitals', 270000000);
      expect(harness.currentPriority).toBe('RESULT');

      // Late countdown tick 0 or 1 arrives
      harness.announceCountdown(0, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toContain('Sold! Rishabh Pant to Delhi Capitals');
    });

    it('cancels active countdown immediately when a new bid is placed', () => {
      harness.announceCountdown(3, 'lot-1');
      expect(harness.currentPriority).toBe('COUNTDOWN');

      harness.announceBid('CSK', 50000000, 'lot-1');
      expect(harness.cancelledCount).toBe(1);
      expect(harness.currentPriority).toBe('BID');
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['3', 'CSK 5 Crore']);
    });

    it('deduplicates identical bids from repeated socket events', () => {
      harness.announceBid('MI', 40000000, 'lot-1');
      harness.announceBid('MI', 40000000, 'lot-1'); // Duplicate
      expect(harness.spokenUtterances).toHaveLength(1);

      // Higher bid or new team announces immediately
      harness.announceBid('RCB', 45000000, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(2);
    });

    it('cancels speech cleanly when host triggers pause, skip, or undo', () => {
      harness.announceCountdown(2, 'lot-1');
      expect(harness.currentPriority).toBe('COUNTDOWN');

      harness.stop();
      expect(harness.currentPriority).toBeNull();
      expect(harness.lastAnnouncedCountdownNumber).toBeNull();
      expect(harness.lastAnnouncedBidKey).toBeNull();
    });
  });

  describe('4. Final Countdown Format (5 to 0)', () => {
    it('returns "5", "4", "3", "2", "1", "0" for the final 5-second countdown phase', () => {
      for (let s = 5; s >= 0; s--) {
        expect(harness.getCountdownSpokenText(s)).toBe(String(s));
      }
      expect(harness.getCountdownSpokenText(6)).toBeNull();
      expect(harness.getCountdownSpokenText(-1)).toBeNull();
    });

    it('drops duplicate and stale countdown numbers', () => {
      harness.announceCountdown(5, 'lot-1');
      harness.announceCountdown(5, 'lot-1'); // Duplicate
      harness.announceCountdown(3, 'lot-1'); // Network skipped 4
      harness.announceCountdown(4, 'lot-1'); // Out of order / stale 4

      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['5', '3']);
    });
  });
});
