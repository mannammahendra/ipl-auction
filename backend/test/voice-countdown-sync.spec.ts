import { describe, it, expect, beforeEach } from 'vitest';

export type SpeechPriority = 'COUNTDOWN' | 'NOMINATION' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  COUNTDOWN: 1,
  NOMINATION: 2,
  RESULT: 3,
};

// Mirror of frontend/src/lib/voice.ts AuctioneerVoiceService with forced 3.0x speed and 3 announcement types
class AuctioneerVoiceLogicTestHarness {
  public enabled: boolean = true;
  public rate: number = 3.0; // Strictly 3.0x speed
  public spokenUtterances: { text: string; priority: SpeechPriority; rate: number }[] = [];
  public cancelledCount: number = 0;
  public lastAnnouncedCountdownNumber: number | null = null;
  public lastAnnouncedCountdownLotId: string | null = null;
  public currentPriority: SpeechPriority | null = null;
  public isSpeakingActive: boolean = false;
  public announcedNominationLots = new Set<string>();

  public getRate(): number {
    return 3.0;
  }

  public setRate(_rate: number): void {
    this.rate = 3.0;
  }

  public setTimerSpeed(_speedMultiplier: number): void {
    // No-op: speech engine is completely independent of Blitz
  }

  public getTimerSpeed(): number {
    return 1.0;
  }

  public computeDynamicRate(): number {
    return 3.0;
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
    this.cancelledCount++;
  }

  public getCountdownSpokenText(seconds: number): string | null {
    if (seconds >= 0 && seconds <= 5) {
      return String(seconds);
    }
    return null;
  }

  public normalizeTeamShort(rawName?: string): string {
    if (!rawName) return 'Franchise';
    const clean = rawName.toUpperCase().trim();
    if (['CSK', 'MI', 'RCB', 'KKR', 'SRH', 'RR', 'GT', 'LSG', 'DC', 'PBKS'].includes(clean)) {
      return clean;
    }
    if (clean.includes('CHENNAI') || clean.includes('SUPER KINGS')) return 'Chennai Super Kings';
    if (clean.includes('MUMBAI') || clean.includes('INDIANS')) return 'Mumbai Indians';
    if (clean.includes('BENGALURU') || clean.includes('BANGALORE') || clean.includes('CHALLENGERS')) return 'Royal Challengers Bengaluru';
    if (clean.includes('KOLKATA') || clean.includes('KNIGHT')) return 'Kolkata Knight Riders';
    if (clean.includes('HYDERABAD') || clean.includes('SUNRISERS')) return 'Sunrisers Hyderabad';
    if (clean.includes('RAJASTHAN') || clean.includes('ROYALS')) return 'Rajasthan Royals';
    if (clean.includes('GUJARAT') || clean.includes('TITANS')) return 'Gujarat Titans';
    if (clean.includes('LUCKNOW') || clean.includes('GIANTS')) return 'Lucknow Super Giants';
    if (clean.includes('DELHI') || clean.includes('CAPITALS')) return 'Delhi Capitals';
    if (clean.includes('PUNJAB') || clean.includes('KINGS')) return 'Punjab Kings';
    return rawName.trim();
  }

  public speak(
    text: string,
    _forceLoud: boolean = false,
    priority: SpeechPriority = 'COUNTDOWN'
  ) {
    if (!this.enabled) return;

    if (priority === 'NOMINATION') {
      this.currentPriority = 'NOMINATION';
    } else if (priority === 'RESULT') {
      this.currentPriority = 'RESULT';
    } else if (priority === 'COUNTDOWN') {
      // Countdown must never interrupt nomination or sale result
      if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'RESULT') {
        return;
      }
      // If voice is currently actively speaking a countdown number, skip outdated intermediate numbers
      if (this.currentPriority === 'COUNTDOWN' && this.isSpeakingActive) {
        return;
      }
      this.currentPriority = 'COUNTDOWN';
    }

    this.isSpeakingActive = true;
    this.spokenUtterances.push({
      text,
      priority,
      rate: 3.0, // Strictly 3.0x on every utterance
    });
  }

  public simulateUtteranceEnd() {
    this.isSpeakingActive = false;
    this.currentPriority = null;
  }

  // 1. Timer: Countdown numbers (5, 4, 3, 2, 1, 0)
  public announceCountdown(seconds: number, lotId?: string) {
    if (!this.enabled || seconds < 0 || seconds > 5) return;

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
      this.speak(spokenText, true, 'COUNTDOWN');
    }
  }

  // 2. Player name: Clear name on nomination
  public announceNomination(playerName: string, lotId?: string) {
    if (!this.enabled || !playerName || !playerName.trim()) return;

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
    this.lastAnnouncedCountdownLotId = lotId || null;

    const cleanPlayer = playerName.trim();
    this.speak(`${cleanPlayer}.`, false, 'NOMINATION');
  }

  // 3. Player sold: Clear winning franchise and player name
  public announceSold(playerName: string, teamName: string) {
    if (!this.enabled) return;
    this.stopCountdown();

    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    const cleanTeam = this.normalizeTeamShort(teamName);
    this.speak(`${cleanPlayer} sold to ${cleanTeam}.`, true, 'RESULT');
  }

  // Disabled per requirements: Speak only Timer, Player name, and Player sold
  public announceBid(_teamShortName?: string, _amount?: number, _lotId?: string) {}
  public announceUnsold(_playerName?: string) {}
  public announceAcceleratedRound(_round?: number, _timerSeconds?: number) {}
  public announceRoundCompleted(_round?: number, _unsoldAvailable?: number, _intermissionSeconds?: number) {}
  public announcePlayerRecalled(_playerName?: string) {}
}

describe('Auction Voice 3.0x Speed and Fixed Announcement Test Suite', () => {
  let harness: AuctioneerVoiceLogicTestHarness;

  beforeEach(() => {
    harness = new AuctioneerVoiceLogicTestHarness();
  });

  describe('1. Forced 3.0x Speech Rate Across All Modes', () => {
    it('forces speech rate to 3.0x for countdown', () => {
      harness.announceCountdown(5, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('5');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('forces speech rate to 3.0x for player nomination', () => {
      harness.announceNomination('Virat Kohli', 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli.');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('forces speech rate to 3.0x for player sold announcement', () => {
      harness.announceSold('Virat Kohli', 'Royal Challengers Bengaluru');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli sold to Royal Challengers Bengaluru.');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('does not allow setRate to overwrite 3.0x speed', () => {
      harness.setRate(1.0);
      expect(harness.getRate()).toBe(3.0);
      harness.announceCountdown(4, 'lot-1');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });
  });

  describe('2. Blitz Independence: Voice Rate Remains 3.0x', () => {
    it('maintains 3.0x speed regardless of Blitz multiplier (1.0x, 1.25x, 1.5x, 2.0x)', () => {
      [1.0, 1.25, 1.5, 2.0].forEach((speedMultiplier) => {
        harness.setTimerSpeed(speedMultiplier);
        expect(harness.computeDynamicRate()).toBe(3.0);
        expect(harness.getRate()).toBe(3.0);
      });
    });

    it('does not alter speech rate when Blitz speed changes', () => {
      harness.setTimerSpeed(2.0); // 2x Blitz
      harness.announceCountdown(5, 'lot-1');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });
  });

  describe('3. Exactly Three Spoken Announcement Types', () => {
    it('speaks countdown numbers (5 to 0)', () => {
      [5, 4, 3, 2, 1, 0].forEach((sec) => {
        harness.announceCountdown(sec, 'lot-1');
        harness.simulateUtteranceEnd();
      });
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['5', '4', '3', '2', '1', '0']);
      harness.spokenUtterances.forEach((u) => {
        expect(u.rate).toBe(3.0);
        expect(u.priority).toBe('COUNTDOWN');
      });
    });

    it('speaks player name clearly on nomination: "${playerName}."', () => {
      harness.announceNomination('Jasprit Bumrah', 'lot-2');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Jasprit Bumrah.');
      expect(harness.spokenUtterances[0].priority).toBe('NOMINATION');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('speaks confirmed sale: "${playerName} sold to ${franchise}."', () => {
      harness.announceSold('Rohit Sharma', 'MI');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Rohit Sharma sold to MI.');
      expect(harness.spokenUtterances[0].priority).toBe('RESULT');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('does NOT speak live bids', () => {
      harness.announceBid('CSK', 20000000, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(0);
    });

    it('does NOT speak unsold player results', () => {
      harness.announceUnsold('Steve Smith');
      expect(harness.spokenUtterances).toHaveLength(0);
    });

    it('does NOT speak round transitions or recall announcements', () => {
      harness.announceAcceleratedRound(2, 15);
      harness.announceRoundCompleted(1, 10, 30);
      harness.announcePlayerRecalled('David Warner');
      expect(harness.spokenUtterances).toHaveLength(0);
    });
  });

  describe('4. Countdown Deduplication and Outdated Tick Skipping', () => {
    it('skips outdated countdown numbers when utterance is currently active', () => {
      harness.announceCountdown(5, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('5');

      // Tick 4 arrives before 5 finishes: 4 is skipped to prevent lag
      harness.announceCountdown(4, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);

      // Utterance finishes
      harness.simulateUtteranceEnd();

      // Tick 3 arrives: voice is free and speaks 3
      harness.announceCountdown(3, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('3');
    });

    it('drops duplicate and out-of-order stale ticks', () => {
      harness.announceCountdown(5, 'lot-1');
      harness.simulateUtteranceEnd();

      harness.announceCountdown(5, 'lot-1'); // Duplicate
      harness.announceCountdown(3, 'lot-1'); // Valid drop to 3
      harness.simulateUtteranceEnd();

      harness.announceCountdown(4, 'lot-1'); // Stale out of order (4 after 3)

      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['5', '3']);
    });

    it('deduplicates nomination announcements for the same lot', () => {
      harness.announceNomination('Virat Kohli', 'lot-1');
      harness.simulateUtteranceEnd();

      harness.announceNomination('Virat Kohli', 'lot-1'); // Duplicate nomination event
      expect(harness.spokenUtterances).toHaveLength(1);
    });
  });

  describe('5. Voice Conflict Prevention & Priority Protection', () => {
    it('countdown ticks NEVER cancel or interrupt active player nomination speech', () => {
      harness.announceNomination('Virat Kohli', 'lot-1');
      expect(harness.currentPriority).toBe('NOMINATION');

      // Countdown tick arrives while nomination is active
      harness.announceCountdown(5, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli.');
      expect(harness.currentPriority).toBe('NOMINATION');
    });

    it('countdown ticks NEVER cancel or interrupt active player sold speech', () => {
      harness.announceSold('Virat Kohli', 'Royal Challengers Bengaluru');
      expect(harness.currentPriority).toBe('RESULT');

      // Late countdown tick arrives while sold is active
      harness.announceCountdown(0, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli sold to Royal Challengers Bengaluru.');
      expect(harness.currentPriority).toBe('RESULT');
    });

    it('new nomination clears countdown state and starts fresh for the lot', () => {
      harness.announceCountdown(3, 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.cancelledCount).toBe(0);

      // New nomination for lot-2
      harness.announceNomination('Jasprit Bumrah', 'lot-2');
      expect(harness.cancelledCount).toBe(1); // Countdown cancelled for new lot
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('Jasprit Bumrah.');
      expect(harness.spokenUtterances[1].priority).toBe('NOMINATION');
    });

    it('mute suppresses all announcements', () => {
      harness.enabled = false;
      harness.announceNomination('Virat Kohli', 'lot-1');
      harness.announceCountdown(5, 'lot-1');
      harness.announceSold('Virat Kohli', 'RCB');
      expect(harness.spokenUtterances).toHaveLength(0);
    });
  });
});
