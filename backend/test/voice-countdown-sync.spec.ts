import { describe, it, expect, beforeEach } from 'vitest';

export type SpeechPriority = 'COUNTDOWN' | 'BID' | 'NOMINATION' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  COUNTDOWN: 1,
  BID: 2,
  NOMINATION: 3,
  RESULT: 4,
};

export function toTeamShortCode(rawName?: string): string {
  if (!rawName) return 'Franchise';
  const clean = rawName.toUpperCase().trim();
  if (['CSK', 'MI', 'RCB', 'KKR', 'SRH', 'RR', 'GT', 'LSG', 'DC', 'PBKS'].includes(clean)) {
    return clean;
  }
  if (clean.includes('CHENNAI') || clean.includes('SUPER KINGS')) return 'CSK';
  if (clean.includes('MUMBAI') || clean.includes('INDIANS')) return 'MI';
  if (clean.includes('BENGALURU') || clean.includes('BANGALORE') || clean.includes('CHALLENGERS')) return 'RCB';
  if (clean.includes('KOLKATA') || clean.includes('KNIGHT')) return 'KKR';
  if (clean.includes('HYDERABAD') || clean.includes('SUNRISERS')) return 'SRH';
  if (clean.includes('RAJASTHAN') || clean.includes('ROYALS')) return 'RR';
  if (clean.includes('GUJARAT') || clean.includes('TITANS')) return 'GT';
  if (clean.includes('LUCKNOW') || clean.includes('GIANTS')) return 'LSG';
  if (clean.includes('DELHI') || clean.includes('CAPITALS')) return 'DC';
  if (clean.includes('PUNJAB') || clean.includes('KINGS')) return 'PBKS';
  return rawName.trim();
}

export function mapPlayerRole(rawRole?: string): string | null {
  if (!rawRole || typeof rawRole !== 'string') return null;
  const clean = rawRole.toUpperCase().trim().replace(/[\s_-]+/g, '_');

  // Wicketkeeper-Batter
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

  // All-rounder
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

// Mirror of frontend/src/lib/voice.ts AuctioneerVoiceService
class AuctioneerVoiceLogicTestHarness {
  public enabled: boolean = true;
  public rate: number = 1.0; // Existing commentary speech rate for announcements
  public spokenUtterances: { text: string; priority: SpeechPriority; rate: number }[] = [];
  public cancelledCount: number = 0;
  public lastAnnouncedCountdownNumber: number | null = null;
  public lastAnnouncedCountdownLotId: string | null = null;
  public lastCountdownSpokenAt: number = 0;
  public lastAnnouncedBidKey: string | null = null;
  public lastAnnouncedSaleKey: string | null = null;
  public currentPriority: SpeechPriority | null = null;
  public isSpeakingActive: boolean = false;
  public announcedNominationLots = new Set<string>();
  public logs: string[] = [];

  public getRate(): number {
    return this.rate;
  }

  public setRate(rate: number): void {
    if (rate > 0) this.rate = rate;
  }

  public setTimerSpeed(_speedMultiplier: number): void {}

  public getTimerSpeed(): number {
    return 1.0;
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

  // Only 3, 2, 1
  public getCountdownSpokenText(seconds: number): string | null {
    if (seconds >= 1 && seconds <= 3) {
      return String(seconds);
    }
    return null;
  }

  public formatRupeesSpoken(amount: number): string {
    if (!amount || amount <= 0) return '0';
    if (amount >= 10000000) {
      const cr = amount / 10000000;
      if (cr % 1 === 0) {
        return `${cr} crore`;
      }
      const cleanCr = parseFloat(cr.toFixed(2));
      return `${cleanCr} crore`;
    }
    if (amount >= 100000) {
      const lakhs = Math.round(amount / 100000);
      return `${lakhs} lakh`;
    }
    return `${amount} rupees`;
  }

  public onTimerTick(remainingSeconds: number) {
    if (remainingSeconds > 3) {
      this.resetCountdown();
    }
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
    } else if (priority === 'BID') {
      if (this.currentPriority === 'RESULT') {
        return;
      }
      this.currentPriority = 'BID';
      this.cancelledCount++;
    } else if (priority === 'COUNTDOWN') {
      // Countdown must never interrupt nomination, bid, or sale result
      if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'BID' || this.currentPriority === 'RESULT') {
        return;
      }
      this.currentPriority = 'COUNTDOWN';
    }

    // Apply 3.0x specifically to timer countdown announcements
    // Player names, roles, bids, and sale announcements retain their existing speech rate (this.rate)
    const effectiveRate = priority === 'COUNTDOWN' ? 3.0 : (this.rate || 1.0);

    this.isSpeakingActive = true;
    this.spokenUtterances.push({
      text,
      priority,
      rate: effectiveRate,
    });
    this.logs.push(`[Speech] Started speaking: "${text}" (${priority}, rate=${effectiveRate}x)`);
  }

  public simulateUtteranceEnd() {
    this.isSpeakingActive = false;
    this.currentPriority = null;
    this.logs.push(`[Speech] Finished speaking`);
  }

  // 1. Timer: Countdown numbers ONLY 3, 2, 1 at 3.0x speed
  public announceCountdown(seconds: number, lotId?: string, speedMultiplier: number = 1.0, mockNow?: number) {
    this.logs.push(`[Countdown] Event received: remainingSeconds=${seconds}, blitz=${speedMultiplier}x, lotId=${lotId || 'none'}`);

    if (!this.enabled) {
      this.logs.push(`[Countdown] Skipped number ${seconds}: voice disabled`);
      return;
    }
    if (seconds < 1 || seconds > 3) return;

    // Critical announcements take precedence: never interrupt nomination, bid, or sale result
    if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'BID' || this.currentPriority === 'RESULT') {
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
    if (this.currentPriority === 'COUNTDOWN' && this.isSpeakingActive && timeSinceLastCountdown < 220) {
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

  // 2. Player name: Announce player name and mapped role clearly at existing commentary speech rate
  // Format: "Next player: [Player Name], [Player Role]."
  public announceNomination(playerName: string, playerRole?: string, lotId?: string) {
    if (!this.enabled) return;
    if (!playerName || !playerName.trim()) return;

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
    this.lastAnnouncedBidKey = null;
    this.lastAnnouncedSaleKey = null;

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

  // 3. Live bids: Announce every valid live bid as "[Franchise], [Amount]." at existing commentary rate
  // e.g. "CSK, 2 crore.", "KKR, 2.5 crore.", "GT, 4 crore."
  public announceBid(teamRaw?: string, amount?: number, bidKeyOrId?: string) {
    if (!this.enabled) return;
    if (!amount || amount <= 0) return;

    const team = toTeamShortCode(teamRaw);
    const amountStr = this.formatRupeesSpoken(amount);
    const bidKey = bidKeyOrId || `${team}_${amount}`;

    // Drop duplicate announcement for the exact same bid
    if (this.lastAnnouncedBidKey === bidKey) {
      return;
    }
    this.lastAnnouncedBidKey = bidKey;

    this.stopCountdown();

    const spokenText = `${team}, ${amountStr}.`;
    this.logs.push(`[AuctionVoice] Bid announced: "${spokenText}"`);

    this.speak(spokenText, false, 'BID');
  }

  // 4. Player sold: “[Player Name] sold to [Franchise Name].” at existing commentary rate
  // e.g. "MS Dhoni sold to CSK." (no final sale amount, no sound effects, no repeat)
  public announceSold(playerName: string, teamName: string, saleKey?: string) {
    if (!this.enabled) return;

    const key = saleKey || `${playerName}_${teamName}`;
    if (this.lastAnnouncedSaleKey === key) {
      return;
    }
    this.lastAnnouncedSaleKey = key;

    this.stopCountdown();
    this.lastAnnouncedBidKey = null;

    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    const cleanTeam = toTeamShortCode(teamName);
    const spokenText = `${cleanPlayer} sold to ${cleanTeam}.`;

    this.logs.push(`[AuctionVoice] Sale announced: "${spokenText}"`);
    this.speak(spokenText, true, 'RESULT');
  }

  public announceUnsold(_playerName?: string) {}
  public announceAcceleratedRound(_round?: number, _timerSeconds?: number) {}
  public announceRoundCompleted(_round?: number, _unsoldAvailable?: number, _intermissionSeconds?: number) {}
  public announcePlayerRecalled(_playerName?: string) {}
}

describe('Timer Voice — 3× Speech Rate and Accurate Timer Synchronization', () => {
  let harness: AuctioneerVoiceLogicTestHarness;

  beforeEach(() => {
    harness = new AuctioneerVoiceLogicTestHarness();
  });

  describe('1. Timer Voice Speed & Rate Decoupling', () => {
    it('applies rate of exactly 3.0× specifically to countdown announcements', () => {
      harness.announceCountdown(3, 'lot-1', 1.0, 1000);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('3');
      expect(harness.spokenUtterances[0].priority).toBe('COUNTDOWN');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('player names, roles, bids, and sale announcements retain their existing speech rate', () => {
      // Set existing commentary rate to natural 1.0x
      harness.setRate(1.0);
      expect(harness.getRate()).toBe(1.0);

      // Player nomination retains 1.0x rate
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      expect(harness.spokenUtterances[0].priority).toBe('NOMINATION');
      expect(harness.spokenUtterances[0].rate).toBe(1.0);

      // Live bid retains 1.0x rate
      harness.announceBid('CSK', 20000000, 'bid-1');
      expect(harness.spokenUtterances[1].priority).toBe('BID');
      expect(harness.spokenUtterances[1].rate).toBe(1.0);

      // Sold announcement retains 1.0x rate
      harness.announceSold('Virat Kohli', 'Royal Challengers Bengaluru');
      expect(harness.spokenUtterances[2].priority).toBe('RESULT');
      expect(harness.spokenUtterances[2].rate).toBe(1.0);

      // Timer countdown is STILL specifically 3.0x
      harness.simulateUtteranceEnd();
      harness.announceCountdown(3, 'lot-2', 1.0, 5000);
      expect(harness.spokenUtterances[3].priority).toBe('COUNTDOWN');
      expect(harness.spokenUtterances[3].rate).toBe(3.0);
    });

    it('does NOT multiply the timer voice rate by Blitz multiplier (1.25x, 1.5x, 2x)', () => {
      [1.0, 1.25, 1.5, 2.0].forEach((blitz, idx) => {
        harness.resetCountdown();
        harness.announceCountdown(3, `lot-${idx}`, blitz, 10000 + idx * 1000);
        harness.simulateUtteranceEnd();
      });

      const countdownUtterances = harness.spokenUtterances.filter((u) => u.priority === 'COUNTDOWN');
      expect(countdownUtterances).toHaveLength(4);
      countdownUtterances.forEach((u) => {
        expect(u.rate).toBe(3.0); // Exactly 3.0x regardless of Blitz
      });
    });
  });

  describe('2. Follow Real Auction Timer (3, 2, 1 Only)', () => {
    it('announces only 3, 2, and 1 and ignores 5, 4, 0, or negative numbers', () => {
      expect(harness.getCountdownSpokenText(3)).toBe('3');
      expect(harness.getCountdownSpokenText(2)).toBe('2');
      expect(harness.getCountdownSpokenText(1)).toBe('1');

      expect(harness.getCountdownSpokenText(5)).toBeNull();
      expect(harness.getCountdownSpokenText(4)).toBeNull();
      expect(harness.getCountdownSpokenText(0)).toBeNull();
      expect(harness.getCountdownSpokenText(-1)).toBeNull();
      expect(harness.getCountdownSpokenText(10)).toBeNull();
    });

    it('speaks each number only when authoritative timer reaches that number at normal speed and 2x Blitz', () => {
      // Normal 1x mode (1000ms interval)
      let time = 1000;
      [3, 2, 1].forEach((sec) => {
        harness.announceCountdown(sec, 'lot-1', 1.0, time);
        time += 150;
        harness.simulateUtteranceEnd();
        time += 850; // Total 1000ms
      });
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['3', '2', '1']);

      // 2x Blitz mode (500ms interval)
      harness.spokenUtterances = [];
      harness.resetCountdown();
      time = 10000;
      [3, 2, 1].forEach((sec) => {
        harness.announceCountdown(sec, 'lot-2', 2.0, time);
        time += 150;
        harness.simulateUtteranceEnd();
        time += 350; // Total 500ms
      });
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['3', '2', '1']);
    });

    it('each valid number is announced at most once per countdown (no duplicates)', () => {
      harness.announceCountdown(3, 'lot-1', 1.0, 1000);
      harness.simulateUtteranceEnd();

      // Duplicate tick 3 received from network
      harness.announceCountdown(3, 'lot-1', 1.0, 1500);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.logs.some((l) => l.includes('Skipped number 3: duplicate tick'))).toBe(true);
    });

    it('drops stale higher ticks (out-of-order delivery)', () => {
      harness.announceCountdown(3, 'lot-1', 1.0, 1000);
      harness.simulateUtteranceEnd();

      harness.announceCountdown(1, 'lot-1', 1.0, 2000);
      harness.simulateUtteranceEnd();

      // Out-of-order late tick 2 arrives after 1 was already announced
      harness.announceCountdown(2, 'lot-1', 1.0, 2500);
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['3', '1']);
      expect(harness.logs.some((l) => l.includes('Skipped number 2: stale tick'))).toBe(true);
    });

    it('skips announcement if speech synthesis is still actively rendering previous digit (<220ms)', () => {
      harness.announceCountdown(3, 'lot-1', 2.0, 1000);
      expect(harness.spokenUtterances).toHaveLength(1);

      // Delayed tick 2 arrives only 100ms later while 3 is actively speaking
      harness.announceCountdown(2, 'lot-1', 2.0, 1100);
      expect(harness.spokenUtterances).toHaveLength(1); // Skipped to avoid delayed wrong number
      expect(harness.logs.some((l) => l.includes('Skipped number 2: browser speech synthesis still rendering'))).toBe(true);

      // Once previous digit finishes and elapsed time passes, 1 speaks normally
      harness.simulateUtteranceEnd();
      harness.announceCountdown(1, 'lot-1', 2.0, 1500);
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances[1].text).toBe('1');
    });

    it('auction continues normally when timer reaches zero (0 never spoken)', () => {
      harness.announceCountdown(1, 'lot-1', 1.0, 1000);
      harness.simulateUtteranceEnd();

      // Authoritative timer reaches zero
      harness.announceCountdown(0, 'lot-1', 1.0, 2000);
      expect(harness.spokenUtterances).toHaveLength(1); // 0 is never queued
      expect(harness.spokenUtterances[0].text).toBe('1');
    });
  });

  describe('3. Prevent Voice Conflicts', () => {
    it('countdown announcements NEVER cancel or interrupt player nomination', () => {
      harness.announceNomination('Jasprit Bumrah', 'BOWLER', 'lot-1');
      expect(harness.currentPriority).toBe('NOMINATION');

      // Countdown tick arrives
      harness.announceCountdown(3, 'lot-1', 1.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Next player: Jasprit Bumrah, Bowler.');
      expect(harness.logs.some((l) => l.includes("higher priority 'NOMINATION' active"))).toBe(true);
    });

    it('countdown announcements NEVER cancel or interrupt live bid announcement', () => {
      harness.announceBid('CSK', 20000000, 'bid-1');
      expect(harness.currentPriority).toBe('BID');

      // Countdown tick arrives
      harness.announceCountdown(2, 'lot-1', 1.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('CSK, 2 crore.');
      expect(harness.logs.some((l) => l.includes("higher priority 'BID' active"))).toBe(true);
    });

    it('countdown announcements NEVER cancel or interrupt sale announcement', () => {
      harness.announceSold('MS Dhoni', 'CSK');
      expect(harness.currentPriority).toBe('RESULT');

      // Countdown tick arrives
      harness.announceCountdown(1, 'lot-1', 1.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('MS Dhoni sold to CSK.');
      expect(harness.logs.some((l) => l.includes("higher priority 'RESULT' active"))).toBe(true);
    });

    it('mute control suppresses all voice announcements completely', () => {
      harness.enabled = false;
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      harness.announceBid('CSK', 20000000, 'bid-1');
      harness.announceCountdown(3, 'lot-1', 2.0);
      harness.announceSold('Virat Kohli', 'RCB');
      expect(harness.spokenUtterances).toHaveLength(0);
    });
  });
});
