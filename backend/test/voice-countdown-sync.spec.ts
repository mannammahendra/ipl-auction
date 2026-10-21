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
  public rate: number = 3.0; // Strictly 3.0x speed
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
      // Prioritize newest bid immediately by cancelling prior bid/speech backlog
      this.cancelledCount++;
    } else if (priority === 'COUNTDOWN') {
      // Countdown must never interrupt nomination, bid, or sale result
      if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'BID' || this.currentPriority === 'RESULT') {
        return;
      }
      this.currentPriority = 'COUNTDOWN';
      this.cancelledCount++;
    }

    this.isSpeakingActive = true;
    const utteranceRate = priority === 'COUNTDOWN' ? 5.0 : 3.0;
    this.spokenUtterances.push({
      text,
      priority,
      rate: utteranceRate,
    });
    this.logs.push(`[Speech] Started speaking: "${text}" (${priority}, rate=${utteranceRate}x)`);
  }

  public simulateUtteranceEnd() {
    this.isSpeakingActive = false;
    this.currentPriority = null;
    this.logs.push(`[Speech] Finished speaking`);
  }

  // 1. Timer: Countdown numbers ONLY 3, 2, 1 at 3.0x speed, synchronized with ticks
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

    this.lastAnnouncedCountdownNumber = seconds;
    this.lastCountdownSpokenAt = mockNow !== undefined ? mockNow : Date.now();

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

  // 3. Live bids: Announce every valid live bid as "[Franchise], [Amount]." at 3.0x speed
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

  // 4. Player sold: “[Player Name] sold to [Franchise Name].” at 3.0x speed
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

describe('Auction Voice Fix — Timer (3, 2, 1), Live Bids, and Sale Announcements', () => {
  let harness: AuctioneerVoiceLogicTestHarness;

  beforeEach(() => {
    harness = new AuctioneerVoiceLogicTestHarness();
  });

  describe('1. Timer Announcements: Only 3, 2, 1 (No 5, 4, 0)', () => {
    it('returns spoken text only for 3, 2, 1 and returns null for 5, 4, 0, or others', () => {
      expect(harness.getCountdownSpokenText(3)).toBe('3');
      expect(harness.getCountdownSpokenText(2)).toBe('2');
      expect(harness.getCountdownSpokenText(1)).toBe('1');

      // Must not announce 5, 4, 0
      expect(harness.getCountdownSpokenText(5)).toBeNull();
      expect(harness.getCountdownSpokenText(4)).toBeNull();
      expect(harness.getCountdownSpokenText(0)).toBeNull();
      expect(harness.getCountdownSpokenText(6)).toBeNull();
      expect(harness.getCountdownSpokenText(-1)).toBeNull();
    });

    it('announces only 3, 2, 1 during countdown and speaks each at 5.0x rate', () => {
      let time = 10000;
      // Countdown ticks from 5 down to 0
      [5, 4, 3, 2, 1, 0].forEach((sec) => {
        harness.announceCountdown(sec, 'lot-1', 2.0, time);
        time += 150;
        harness.simulateUtteranceEnd();
        time += 350;
      });

      // Exactly 3, 2, 1 spoken — 5, 4, and 0 are skipped
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['3', '2', '1']);
      harness.spokenUtterances.forEach((u) => {
        expect(u.rate).toBe(5.0);
        expect(u.priority).toBe('COUNTDOWN');
      });
    });

    it('resets countdown when timer ticks above 3 seconds', () => {
      harness.announceCountdown(3, 'lot-1', 1.0, 1000);
      expect(harness.lastAnnouncedCountdownNumber).toBe(3);

      harness.onTimerTick(10);
      expect(harness.lastAnnouncedCountdownNumber).toBeNull();
    });

    it('drops duplicate ticks and stale higher ticks', () => {
      harness.announceCountdown(3, 'lot-1', 1.0, 1000);
      harness.simulateUtteranceEnd();

      harness.announceCountdown(3, 'lot-1', 1.0, 1500); // duplicate
      expect(harness.spokenUtterances).toHaveLength(1);

      harness.announceCountdown(1, 'lot-1', 1.0, 2000);
      harness.simulateUtteranceEnd();

      harness.announceCountdown(2, 'lot-1', 1.0, 2500); // stale higher tick
      expect(harness.spokenUtterances).toHaveLength(2);
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['3', '1']);
    });
  });

  describe('2. Live Bid Announcements: [Franchise], [Amount].', () => {
    it('formats rupee values into clean spoken crore and lakh strings', () => {
      expect(harness.formatRupeesSpoken(20000000)).toBe('2 crore');
      expect(harness.formatRupeesSpoken(25000000)).toBe('2.5 crore');
      expect(harness.formatRupeesSpoken(40000000)).toBe('4 crore');
      expect(harness.formatRupeesSpoken(5000000)).toBe('50 lakh');
      expect(harness.formatRupeesSpoken(7500000)).toBe('75 lakh');
    });

    it('maps team names to official short codes (CSK, KKR, GT, etc.)', () => {
      expect(toTeamShortCode('Chennai Super Kings')).toBe('CSK');
      expect(toTeamShortCode('Kolkata Knight Riders')).toBe('KKR');
      expect(toTeamShortCode('Gujarat Titans')).toBe('GT');
      expect(toTeamShortCode('Mumbai Indians')).toBe('MI');
      expect(toTeamShortCode('Royal Challengers Bengaluru')).toBe('RCB');
      expect(toTeamShortCode('Sunrisers Hyderabad')).toBe('SRH');
      expect(toTeamShortCode('Rajasthan Royals')).toBe('RR');
      expect(toTeamShortCode('Lucknow Super Giants')).toBe('LSG');
      expect(toTeamShortCode('Delhi Capitals')).toBe('DC');
      expect(toTeamShortCode('Punjab Kings')).toBe('PBKS');
      expect(toTeamShortCode('CSK')).toBe('CSK');
    });

    it('announces live bids with format "[Franchise], [Amount]." at 3.0x speed', () => {
      harness.announceBid('Chennai Super Kings', 20000000, 'bid-1');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('CSK, 2 crore.');
      expect(harness.spokenUtterances[0].priority).toBe('BID');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);

      harness.announceBid('KKR', 25000000, 'bid-2');
      expect(harness.spokenUtterances[1].text).toBe('KKR, 2.5 crore.');
      expect(harness.spokenUtterances[1].priority).toBe('BID');
      expect(harness.spokenUtterances[1].rate).toBe(3.0);

      harness.announceBid('Gujarat Titans', 40000000, 'bid-3');
      expect(harness.spokenUtterances[2].text).toBe('GT, 4 crore.');
      expect(harness.spokenUtterances[2].priority).toBe('BID');
      expect(harness.spokenUtterances[2].rate).toBe(3.0);
    });

    it('prioritizes newest accepted bid immediately during rapid bidding by cancelling previous backlog', () => {
      // Rapid bids arriving within milliseconds of each other
      harness.announceBid('CSK', 20000000, 'bid-1');
      expect(harness.cancelledCount).toBeGreaterThanOrEqual(1);

      harness.announceBid('MI', 22000000, 'bid-2');
      expect(harness.cancelledCount).toBeGreaterThanOrEqual(2);

      harness.announceBid('RCB', 25000000, 'bid-3');
      expect(harness.cancelledCount).toBeGreaterThanOrEqual(3);

      expect(harness.spokenUtterances).toHaveLength(3);
      expect(harness.spokenUtterances[2].text).toBe('RCB, 2.5 crore.');
    });

    it('deduplicates identical bid announcements', () => {
      harness.announceBid('CSK', 20000000, 'bid-1');
      harness.announceBid('CSK', 20000000, 'bid-1'); // Duplicate
      expect(harness.spokenUtterances).toHaveLength(1);
    });
  });

  describe('3. Sale Announcement: [Player Name] sold to [Franchise Name].', () => {
    it('announces confirmed sale in format "[Player Name] sold to [Franchise Name]." at 3.0x speed', () => {
      harness.announceSold('MS Dhoni', 'Chennai Super Kings');
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('MS Dhoni sold to CSK.');
      expect(harness.spokenUtterances[0].priority).toBe('RESULT');
      expect(harness.spokenUtterances[0].rate).toBe(3.0);
    });

    it('does NOT include sale price in the voice announcement', () => {
      harness.announceSold('Virat Kohli', 'RCB');
      expect(harness.spokenUtterances[0].text).not.toContain('crore');
      expect(harness.spokenUtterances[0].text).not.toContain('lakh');
      expect(harness.spokenUtterances[0].text).toBe('Virat Kohli sold to RCB.');
    });

    it('does not repeat sale announcement for the same player/lot', () => {
      harness.announceSold('Rohit Sharma', 'MI', 'sale-lot-1');
      harness.announceSold('Rohit Sharma', 'MI', 'sale-lot-1'); // Duplicate
      expect(harness.spokenUtterances).toHaveLength(1);
    });
  });

  describe('4. Inter-Priority Conflict Prevention', () => {
    it('countdown ticks NEVER interrupt active player nomination', () => {
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      expect(harness.currentPriority).toBe('NOMINATION');

      // Countdown tick 3 arrives while nomination is speaking
      harness.announceCountdown(3, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('Next player: Virat Kohli, Batter.');
    });

    it('countdown ticks NEVER interrupt active live bid announcement', () => {
      harness.announceBid('CSK', 20000000, 'bid-1');
      expect(harness.currentPriority).toBe('BID');

      // Countdown tick 2 arrives while bid is speaking
      harness.announceCountdown(2, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('CSK, 2 crore.');
    });

    it('countdown ticks NEVER interrupt confirmed sale announcement', () => {
      harness.announceSold('MS Dhoni', 'CSK');
      expect(harness.currentPriority).toBe('RESULT');

      // Countdown tick 1 arrives while sale announcement is speaking
      harness.announceCountdown(1, 'lot-1', 2.0);
      expect(harness.spokenUtterances).toHaveLength(1);
      expect(harness.spokenUtterances[0].text).toBe('MS Dhoni sold to CSK.');
    });

    it('live bid cancels active countdown immediately', () => {
      harness.announceCountdown(3, 'lot-1', 1.0);
      expect(harness.spokenUtterances[0].text).toBe('3');

      // Live bid arrives
      harness.announceBid('KKR', 25000000, 'bid-1');
      expect(harness.spokenUtterances[1].text).toBe('KKR, 2.5 crore.');
      expect(harness.currentPriority).toBe('BID');
    });

    it('mute control suppresses all voice announcements', () => {
      harness.enabled = false;
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      harness.announceBid('CSK', 20000000, 'bid-1');
      harness.announceCountdown(3, 'lot-1', 2.0);
      harness.announceSold('Virat Kohli', 'RCB');
      expect(harness.spokenUtterances).toHaveLength(0);
    });
  });

  describe('5. Rate Configuration: Countdown Voice at 5.0x, Announcements at 3.0x', () => {
    it('applies 5.0x rate for countdown, and 3.0x rate for nomination, bid, and sold', () => {
      harness.announceNomination('Virat Kohli', 'BATSMAN', 'lot-1');
      harness.simulateUtteranceEnd();

      harness.announceBid('CSK', 20000000, 'bid-1');
      harness.simulateUtteranceEnd();

      harness.announceCountdown(3, 'lot-1', 1.0);
      harness.simulateUtteranceEnd();

      harness.announceSold('MS Dhoni', 'CSK');
      harness.simulateUtteranceEnd();

      expect(harness.spokenUtterances).toHaveLength(4);
      expect(harness.spokenUtterances[0]).toMatchObject({ text: 'Next player: Virat Kohli, Batter.', rate: 3.0 });
      expect(harness.spokenUtterances[1]).toMatchObject({ text: 'CSK, 2 crore.', rate: 3.0 });
      expect(harness.spokenUtterances[2]).toMatchObject({ text: '3', rate: 5.0 });
      expect(harness.spokenUtterances[3]).toMatchObject({ text: 'MS Dhoni sold to CSK.', rate: 3.0 });
    });

    it('speaks numbers 3, 2, 1 quickly and sequentially following the timer at 5.0x speed at 1x and 2x Blitz', () => {
      // 1x Normal mode
      harness.resetCountdown();
      harness.spokenUtterances = [];
      [3, 2, 1].forEach((sec) => {
        harness.announceCountdown(sec, 'lot-1', 1.0);
        harness.simulateUtteranceEnd();
      });
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['3', '2', '1']);
      expect(harness.spokenUtterances.every((u) => u.rate === 5.0)).toBe(true);

      // 2x Blitz mode
      harness.resetCountdown();
      harness.spokenUtterances = [];
      [3, 2, 1].forEach((sec) => {
        harness.announceCountdown(sec, 'lot-2', 2.0);
        harness.simulateUtteranceEnd();
      });
      expect(harness.spokenUtterances.map((u) => u.text)).toEqual(['3', '2', '1']);
      expect(harness.spokenUtterances.every((u) => u.rate === 5.0)).toBe(true);
    });
  });
});
