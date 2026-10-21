import { describe, it, expect, beforeEach } from 'vitest';

export type SpeechPriority = 'COUNTDOWN' | 'NOMINATION' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  COUNTDOWN: 1,
  NOMINATION: 2,
  RESULT: 3,
};

export function mapPlayerRole(rawRole?: string): string | null {
  if (!rawRole || typeof rawRole !== 'string') return null;
  const clean = rawRole.toUpperCase().trim().replace(/[\s_-]+/g, '_');

  // Wicketkeeper-Batter (evaluate before Batter to match WK_BATTER, etc.)
  if (
    clean === 'WICKET_KEEPER' ||
    clean === 'WICKETKEEPER' ||
    clean === 'WK' ||
    clean === 'WK_BATTER' ||
    clean === 'WICKET_KEEPER_BATTER' ||
    clean === 'WICKETKEEPER_BATTER' ||
    clean.includes('WICKET') ||
    clean.startsWith('WK')
  ) {
    return 'Wicketkeeper-Batter';
  }

  // All-rounder (evaluate before Batter to match ALL_ROUNDER, etc.)
  if (
    clean === 'ALL_ROUNDER' ||
    clean === 'ALLROUNDER' ||
    clean === 'ALL_ROUND' ||
    clean === 'AR' ||
    clean.includes('ALL_ROUND') ||
    clean.includes('ALLROUND')
  ) {
    return 'All-rounder';
  }

  // Batter
  if (
    clean === 'BATSMAN' ||
    clean === 'BATSMEN' ||
    clean === 'BATTER' ||
    clean === 'BAT' ||
    clean.includes('BAT')
  ) {
    return 'Batter';
  }

  // Bowler
  if (
    clean === 'BOWLER' ||
    clean === 'BOWL' ||
    clean === 'SPINNER' ||
    clean === 'FAST_BOWLER' ||
    clean === 'SEAMER' ||
    clean.includes('BOWL')
  ) {
    return 'Bowler';
  }

  return null;
}

// Mirror of frontend/src/lib/voice.ts AuctioneerVoiceService with 3.0x speed, role mapping, and 2x Blitz support
class AuctioneerVoiceLogicTestHarness {
  public enabled: boolean = true;
  public rate: number = 3.0; // Strictly 3.0x speed
  public spokenUtterances: { text: string; priority: SpeechPriority; rate: number }[] = [];
  public cancelledCount: number = 0;
  public lastAnnouncedCountdownNumber: number | null = null;
  public lastAnnouncedCountdownLotId: string | null = null;
  public lastCountdownSpokenAt: number = 0;
  public currentPriority: SpeechPriority | null = null;
  public isSpeakingActive: boolean = false;
  public announcedNominationLots = new Set<string>();
  public logs: string[] = [];

  public getRate(): number {
    return 3.0;
  }

  public setRate(_rate: number): void {
    this.rate = 3.0;
  }

  public setTimerSpeed(_speedMultiplier: number): void {}

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
      this.cancelledCount++;
    } else if (priority === 'RESULT') {
      this.currentPriority = 'RESULT';
      this.cancelledCount++;
    } else if (priority === 'COUNTDOWN') {
      // Countdown must never interrupt nomination or sale result
      if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'RESULT') {
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
    this.logs.push(`[Speech] Started speaking: "${text}" (${priority}, rate=3.0x)`);
  }

  public simulateUtteranceEnd() {
    this.isSpeakingActive = false;
    this.currentPriority = null;
    this.logs.push(`[Speech] Finished speaking`);
  }

  // 1. Timer: Countdown numbers (5 to 0) at 3.0x speed
  public announceCountdown(seconds: number, lotId?: string, speedMultiplier: number = 1.0, mockNow?: number) {
    this.logs.push(`[Countdown] Event received: remainingSeconds=${seconds}, blitz=${speedMultiplier}x, lotId=${lotId || 'none'}`);

    if (!this.enabled) {
      this.logs.push(`[Countdown] Skipped number ${seconds}: voice disabled`);
      return;
    }
    if (seconds < 0 || seconds > 5) return;

    // Critical announcements take precedence
    if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'RESULT') {
      this.logs.push(`[Countdown] Skipped number ${seconds}: higher priority '${this.currentPriority}' active`);
      return;
    }

    // Reset countdown sequence if lot changed
    if (lotId && lotId !== this.lastAnnouncedCountdownLotId) {
      this.lastAnnouncedCountdownLotId = lotId;
      this.lastAnnouncedCountdownNumber = null;
    }

    // Drop duplicate ticks for the same second
    if (this.lastAnnouncedCountdownNumber === seconds) {
      this.logs.push(`[Countdown] Skipped number ${seconds}: duplicate tick`);
      return;
    }

    // Drop stale higher ticks
    if (this.lastAnnouncedCountdownNumber !== null && seconds > this.lastAnnouncedCountdownNumber) {
      this.logs.push(`[Countdown] Skipped number ${seconds}: stale tick (last was ${this.lastAnnouncedCountdownNumber})`);
      return;
    }

    const now = mockNow !== undefined ? mockNow : Date.now();
    const timeSinceLastCountdown = now - this.lastCountdownSpokenAt;
    if (this.currentPriority === 'COUNTDOWN' && this.isSpeakingActive && timeSinceLastCountdown < 320) {
      this.logs.push(`[Countdown] Skipped number ${seconds}: browser speech synthesis still rendering previous digit (${timeSinceLastCountdown}ms elapsed)`);
      return;
    }

    this.lastAnnouncedCountdownNumber = seconds;
    this.lastCountdownSpokenAt = now;

    const spokenText = this.getCountdownSpokenText(seconds);
    if (spokenText) {
      this.logs.push(`[Countdown] Queued number ${seconds} for speech at 3.0x`);
      this.speak(spokenText, true, 'COUNTDOWN');
    }
  }

  // 2. Player name: Announce player name and mapped role clearly at 3.0x speed
  // Format: "Next player: [Player Name], [Player Role]."
  public announceNomination(playerName: string, playerRole?: string, lotId?: string) {
    if (!this.enabled) return;
    if (!playerName || !playerName.trim()) return;

    // Deduplication per lotId
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
    const mappedRole = mapPlayerRole(playerRole);

    if (playerRole && !mappedRole) {
      this.logs.push(`[AuctionVoice] Unmapped or unrecognized player role: "${playerRole}" for player "${cleanPlayer}"`);
    } else if (!playerRole) {
      this.logs.push(`[AuctionVoice] Missing player role for player "${cleanPlayer}"`);
    }

    const spokenText = mappedRole
      ? `Next player: ${cleanPlayer}, ${mappedRole}.`
      : `Next player: ${cleanPlayer}.`;

    this.logs.push(`[AuctionVoice] Nomination announced: "${spokenText}" (lot: ${lotId || 'unknown'})`);
    this.speak(spokenText, false, 'NOMINATION');
  }

  // 3. Player sold: “[Player Name] sold to [Franchise Name].” at 3.0x speed
  public announceSold(playerName: string, teamName: string) {
    if (!this.enabled) return;
    this.stopCountdown();

    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    const cleanTeam = this.normalizeTeamShort(teamName);
    const spokenText = `${cleanPlayer} sold to ${cleanTeam}.`;

    this.logs.push(`[AuctionVoice] Sale announced: "${spokenText}"`);
    this.speak(spokenText, true, 'RESULT');
  }

  // Disabled per requirements
  public announceBid(_teamShortName?: string, _amount?: number, _lotId?: string) {}
  public announceUnsold(_playerName?: string) {}
  public announceAcceleratedRound(_round?: number, _timerSeconds?: number) {}
  public announceRoundCompleted(_round?: number, _unsoldAvailable?: number, _intermissionSeconds?: number) {}
  public announcePlayerRecalled(_playerName?: string) {}
}

describe('Auction Voice 2x Blitz, Countdown Reliability, and Player Role Test Suite', () => {
  let harness: AuctioneerVoiceLogicTestHarness;

  beforeEach(() => {
    harness = new AuctioneerVoiceLogicTestHarness();
  });

  describe('Priority 3: Player Role Normalization & Nomination Announcements', () => {
    it('correctly maps all 4 required roles: Batter, Bowler, Wicketkeeper-Batter, All-rounder', () => {
      expect(mapPlayerRole('BATSMAN')).toBe('Batter');
      expect(mapPlayerRole('BATTER')).toBe('Batter');
      expect(mapPlayerRole('BOWLER')).toBe('Bowler');
      expect(mapPlayerRole('FAST_BOWLER')).toBe('Bowler');
      expect(mapPlayerRole('WICKET_KEEPER')).toBe('Wicketkeeper-Batter');
      expect(mapPlayerRole('WK_BATTER')).toBe('Wicketkeeper-Batter');
      expect(mapPlayerRole('ALL_ROUNDER')).toBe('All-rounder');
      expect(mapPlayerRole('ALLROUNDER')).toBe('All-rounder');
    });

    it('announces Batter correctly: "Next player: [Name], Batter."', () => {
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Next player: Virat Kohli, Batter.');
      expect(harness.spokenUtterances[0].priority).toBe('NOMINATION');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('announces Bowler correctly: "Next player: [Name], Bowler."', () => {
      harness.announceNomination('Jasprit Bumrah', 'BOWLER', 'lot-2');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Next player: Jasprit Bumrah, Bowler.');
      expect(harness.spokenUtterances[0].priority).toBe('NOMINATION');
    });

    it('announces Wicketkeeper-Batter correctly: "Next player: [Name], Wicketkeeper-Batter."', () => {
      harness.announceNomination('Rishabh Pant', 'WICKET_KEEPER', 'lot-3');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Next player: Rishabh Pant, Wicketkeeper-Batter.');
      expect(harness.spokenUtterances[0].priority).toBe('NOMINATION');
    });

    it('announces All-rounder correctly: "Next player: [Name], All-rounder."', () => {
      harness.announceNomination('Hardik Pandya', 'ALL_ROUNDER', 'lot-4');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Next player: Hardik Pandya, All-rounder.');
      expect(harness.spokenUtterances[0].priority).toBe('NOMINATION');
    });

    it('handles missing or unmapped role without guessing and logs warning', () => {
      harness.announceNomination('Unknown Player', undefined, 'lot-5');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Next player: Unknown Player.');
      expect(harness.logs.some((l) => l.includes('Missing player role'))).toBe(true);
    });

    it('deduplicates nomination announcements for the same lot', () => {
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      expect(harness.spokenUtterances).toHaveLength(1);
    });
  });

  describe('Player Sale Announcements', () => {
    it('announces confirmed sale: "[Player Name] sold to [Franchise Name]."', () => {
      harness.announceSold('Virat Kohli', 'Royal Challengers Bengaluru');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli sold to Royal Challengers Bengaluru.');
      expect(harness.spokenUtterances[0].priority).toBe('RESULT');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('normalizes franchise short codes accurately in sale announcement', () => {
      harness.announceSold('Rohit Sharma', 'MI');
      expect(harness.spokenUtterances[0].text).toBe('Rohit Sharma sold to MI.');
    });
  });

  describe('Priority 2: Countdown Announcement Reliability at 2x Blitz (500ms intervals)', () => {
    it('announces every valid countdown number 5, 4, 3, 2, 1, 0 at 2x Blitz when ticks arrive every 500ms', () => {
      let time = 10000;
      [5, 4, 3, 2, 1, 0].forEach((sec) => {
        harness.announceCountdown(sec, 'lot-1', 2.0, time);
        // Single digit utterance at 3.0x takes ~120ms
        time += 150;
        harness.simulateUtteranceEnd();
        time += 350; // Total 500ms between ticks (2x Blitz)
      });

      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['5', '4', '3', '2', '1', '0']);
      harness.spokenUtterances.forEach((u) => {
        expect(u.rate).toBe(3.0);
        expect(u.priority).toBe('COUNTDOWN');
      });
    });

    it('logs detailed countdown lifecycle: event received, number queued, and speech start/end', () => {
      harness.announceCountdown(5, 'lot-1', 2.0, 1000);
      expect(harness.logs.some((l) => l.includes('Event received: remainingSeconds=5, blitz=2x'))).toBe(true);
      expect(harness.logs.some((l) => l.includes('Queued number 5 for speech at 3.0x'))).toBe(true);
      expect(harness.logs.some((l) => l.includes('Started speaking: "5"'))).toBe(true);
    });

    it('safely skips and logs when browser speech synthesis engine genuinely lags (> 320ms)', () => {
      // Tick 5 arrives at t=1000
      harness.announceCountdown(5, 'lot-1', 2.0, 1000);
      expect(harness.spokenUtterances).toHaveLength(1);

      // Tick 4 arrives at t=1200 (only 200ms elapsed, speech still active)
      harness.announceCountdown(4, 'lot-1', 2.0, 1200);
      expect(harness.spokenUtterances).toHaveLength(1); // 4 skipped non-blockingly
      expect(harness.logs.some((l) => l.includes('Skipped number 4: browser speech synthesis still rendering'))).toBe(true);

      // Speech ends at t=1300
      harness.simulateUtteranceEnd();

      // Tick 3 arrives at t=1500 (> 320ms elapsed and speech ended)
      harness.announceCountdown(3, 'lot-1', 2.0, 1500);
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('3');
    });

    it('drops duplicate ticks and stale higher ticks', () => {
      harness.announceCountdown(5, 'lot-1', 2.0, 1000);
      harness.simulateUtteranceEnd();

      harness.announceCountdown(5, 'lot-1', 2.0, 1500); // Duplicate 5
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.logs.some((l) => l.includes('Skipped number 5: duplicate tick'))).toBe(true);

      harness.announceCountdown(3, 'lot-1', 2.0, 2000);
      harness.simulateUtteranceEnd();

      harness.announceCountdown(4, 'lot-1', 2.0, 2500); // Stale higher tick (4 after 3)
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.logs.some((l) => l.includes('Skipped number 4: stale tick'))).toBe(true);
    });
  });

  describe('Priority 1: Conflict Prevention, Authoritative Priority, and Resilience', () => {
    it('countdown ticks NEVER interrupt or cancel active nomination announcement', () => {
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      expect(harness.currentPriority).toBe('NOMINATION');

      // Countdown tick 5 arrives while nomination is speaking
      harness.announceCountdown(5, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Next player: Virat Kohli, Batter.');
      expect(harness.currentPriority).toBe('NOMINATION');
      expect(harness.logs.some((l) => l.includes("higher priority 'NOMINATION' active"))).toBe(true);
    });

    it('countdown ticks NEVER interrupt or cancel active confirmed sale announcement', () => {
      harness.announceSold('Virat Kohli', 'Royal Challengers Bengaluru');
      expect(harness.currentPriority).toBe('RESULT');

      // Late tick 0 arrives while sale announcement is speaking
      harness.announceCountdown(0, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli sold to Royal Challengers Bengaluru.');
      expect(harness.currentPriority).toBe('RESULT');
      expect(harness.logs.some((l) => l.includes("higher priority 'RESULT' active"))).toBe(true);
    });

    it('new nomination cancels earlier lot countdown state and starts fresh', () => {
      harness.announceCountdown(3, 'lot-1', 2.0, 1000);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.cancelledCount).toBe(0);

      // New nomination for lot-2
      harness.announceNomination('Jasprit Bumrah', 'BOWLER', 'lot-2');
      expect(harness.cancelledCount).toBeGreaterThanOrEqual(1); // Countdown cancelled cleanly for new lot
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('Next player: Jasprit Bumrah, Bowler.');
      expect(harness.spokenUtterances[1].priority).toBe('NOMINATION');
    });

    it('mute control suppresses all speech synthesis calls', () => {
      harness.enabled = false;
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      harness.announceCountdown(5, 'lot-1', 2.0);
      harness.announceSold('Virat Kohli', 'RCB');
      expect(harness.spokenUtterances).toHaveLength(0);
    });
  });
});
