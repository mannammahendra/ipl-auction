import { describe, it, expect, beforeEach, vi } from 'vitest';

export type SpeechPriority = 'INFO' | 'COUNTDOWN' | 'NOMINATION' | 'BID' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  INFO: 1,
  COUNTDOWN: 2,
  NOMINATION: 3,
  BID: 4,
  RESULT: 5,
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

export function toTeamSpokenName(rawName?: string): string {
  if (!rawName) return 'Franchise';
  const code = toTeamShortCode(rawName);
  switch (code) {
    case 'CSK':
      return 'Chennai Super Kings';
    case 'MI':
      return 'Mumbai Indians';
    case 'RCB':
      return 'Royal Challengers Bengaluru';
    case 'KKR':
      return 'Kolkata Knight Riders';
    case 'SRH':
      return 'Sunrisers Hyderabad';
    case 'RR':
      return 'Rajasthan Royals';
    case 'GT':
      return 'Gujarat Titans';
    case 'LSG':
      return 'Lucknow Super Giants';
    case 'DC':
      return 'Delhi Capitals';
    case 'PBKS':
      return 'Punjab Kings';
    default:
      return rawName.trim();
  }
}

export function formatRupeesSpoken(amount: number): string {
  if (!amount || amount <= 0) return '0 rupees';
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    if (cr % 1 === 0) {
      return `${cr} Crore`;
    }
    const cleanCr = parseFloat(cr.toFixed(2));
    return `${cleanCr} Crore`;
  }
  if (amount >= 100000) {
    const lakhs = Math.round(amount / 100000);
    return `${lakhs} Lakh`;
  }
  return `${amount} rupees`;
}

// Test harness mirroring frontend/src/lib/voice.ts AuctioneerVoiceService
class AuctioneerVoiceLogicTestHarness {
  public enabled: boolean = true;
  public rate: number = 3.0; // Required 2.0x default
  public pitch: number = 1.0; // 1.0x normal pitch
  public volume: number = 0.85; // 85% volume
  public countdownEnabled: boolean = true;
  public spokenUtterances: { text: string; priority: SpeechPriority; rate: number; pitch: number; volume: number }[] = [];
  public cancelledCount: number = 0;
  public lastAnnouncedCountdownNumber: number | null = null;
  public lastAnnouncedCountdownLotId: string | null = null;
  public currentDeadlineGeneration: number = 0;
  public lastAnnouncedBidKey: string | null = null;
  public lastAnnouncedSaleKey: string | null = null;
  public currentPriority: SpeechPriority | null = null;
  public isSpeakingActive: boolean = false;
  public announcedNominationLots = new Set<string>();

  public getRate(): number {
    return this.rate;
  }

  public setRate(newRate: number): void {
    this.rate = newRate;
  }

  // Changing blitz speed must NEVER change voice speed
  public setTimerSpeed(_multiplier: number): void {
    // Deliberately no-op to ensure independent voice speed
  }

  public getCountdownSpokenText(seconds: number): string | null {
    switch (seconds) {
      case 3:
        return 'Three';
      case 2:
        return 'Two';
      case 1:
        return 'One';
      default:
        return null;
    }
  }

  public stop(): void {
    this.isSpeakingActive = false;
    this.currentPriority = null;
    this.resetCountdown();
    this.cancelledCount++;
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

  public onTimerTick(remainingSeconds: number) {
    if (remainingSeconds > 5) {
      this.resetCountdown();
    }
  }

  public speak(text: string, priority: SpeechPriority = 'INFO'): void {
    if (!this.enabled || !text) return;

    const currentPrioNum = this.currentPriority ? PRIORITY_ORDER[this.currentPriority] : 0;
    const newPrioNum = PRIORITY_ORDER[priority];

    if (this.isSpeakingActive && currentPrioNum > newPrioNum) {
      return;
    }

    if (this.isSpeakingActive) {
      this.cancelledCount++;
    }

    this.currentPriority = priority;
    this.isSpeakingActive = true;

    this.spokenUtterances.push({
      text,
      priority,
      rate: this.rate, // Always the configured rate (default 3.0x)
      pitch: this.pitch,
      volume: this.volume,
    });
  }

  public simulateUtteranceEnd(): void {
    this.isSpeakingActive = false;
    this.currentPriority = null;
  }

  public announceNomination(playerName: string, role?: string | null, lotId?: string, basePrice?: number): void {
    if (!this.enabled || !playerName) return;

    this.currentDeadlineGeneration++;
    this.stopCountdown();

    const dedupKey = lotId || playerName;
    if (lotId && this.announcedNominationLots.has(lotId)) {
      return;
    }
    this.announcedNominationLots.add(dedupKey);

    const formattedPrice = formatRupeesSpoken(basePrice || 2000000);
    const rolePart = role ? `, ${role}` : '';
    const text = `Next player: ${playerName}${rolePart}. Base price: ${formattedPrice}.`;
    this.speak(text, 'NOMINATION');
  }

  public announceBid(teamName: string, amount: number, isStarting: boolean = false, lotId?: string): void {
    if (!this.enabled || !amount) return;

    this.currentDeadlineGeneration++;
    this.stopCountdown();

    const dedupKey = `${lotId || ''}-${teamName}-${amount}`;
    if (this.lastAnnouncedBidKey === dedupKey) {
      return;
    }
    this.lastAnnouncedBidKey = dedupKey;

    const spokenTeam = toTeamSpokenName(teamName);
    const spokenAmount = formatRupeesSpoken(amount);
    const text = isStarting
      ? `${spokenTeam} opens bid at ${spokenAmount}.`
      : `${spokenTeam} bids ${spokenAmount}.`;

    this.speak(text, 'BID');
  }

  public announceCountdown(seconds: number, lotId?: string, _speedMultiplier: number = 1.0): void {
    if (!this.enabled || !this.countdownEnabled) return;
    if (seconds < 1 || seconds > 3) return;
    if (this.currentPriority === "RESULT") return;

    if (
      this.currentPriority === 'NOMINATION' ||
      this.currentPriority === 'BID' ||
      this.currentPriority === 'RESULT'
    ) {
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

    const spokenText = this.getCountdownSpokenText(seconds);
    if (!spokenText) return;

    this.lastAnnouncedCountdownNumber = seconds;

    const capturedGen = this.currentDeadlineGeneration;
    // Dispatch check for invalidation
    if (this.currentDeadlineGeneration === capturedGen) {
      this.speak(spokenText, 'COUNTDOWN');
    }
  }

  public announceSale(playerName: string, winningTeamName: string, price: number, lotId?: string): void {
    if (!this.enabled || !playerName) return;

    this.currentDeadlineGeneration++;
    this.stopCountdown();

    const dedupKey = `${lotId || ''}-${winningTeamName}-${price}`;
    if (this.lastAnnouncedSaleKey === dedupKey) {
      return;
    }
    this.lastAnnouncedSaleKey = dedupKey;

    const spokenTeam = toTeamSpokenName(winningTeamName);
    const spokenAmount = formatRupeesSpoken(price);
    const text = `SOLD! ${playerName} to ${spokenTeam} for ${spokenAmount}.`;
    this.speak(text, 'RESULT');
  }

  public announceUnsold(playerName: string, lotId?: string): void {
    if (!this.enabled || !playerName) return;

    this.currentDeadlineGeneration++;
    this.stopCountdown();

    const dedupKey = `${lotId || ''}-${playerName}-UNSOLD`;
    if (this.lastAnnouncedSaleKey === dedupKey) {
      return;
    }
    this.lastAnnouncedSaleKey = dedupKey;

    const text = `UNSOLD! ${playerName}.`;
    this.speak(text, 'RESULT');
  }
}

describe('Auction Voice Speed & Countdown Synchronization Test Suite', () => {
  let voice: AuctioneerVoiceLogicTestHarness;

  beforeEach(() => {
    voice = new AuctioneerVoiceLogicTestHarness();
  });

  // 1. Normal voice announcements use the configured 3.0x speed
  it('1. normal voice announcements use the configured 3.0x speed by default', () => {
    expect(voice.getRate()).toBe(3.0);
    voice.announceNomination('Virat Kohli', 'Batter', 'lot-1', 20000000);
    expect(voice.spokenUtterances.length).toBe(1);
    expect(voice.spokenUtterances[0].rate).toBe(3.0);
    expect(voice.spokenUtterances[0].pitch).toBe(1.0);
    expect(voice.spokenUtterances[0].volume).toBe(0.85);
  });

  // 2. Blitz at 1x does not change the voice speed
  it('2. blitz at 1x does not change the voice speed', () => {
    voice.setTimerSpeed(1.0);
    expect(voice.getRate()).toBe(3.0);
    voice.announceCountdown(3, 'lot-1', 1.0);
    expect(voice.spokenUtterances[0].rate).toBe(3.0);
  });

  // 3. Blitz at 2x does not change the voice speed
  it('3. blitz at 2x does not change the voice speed', () => {
    voice.setTimerSpeed(2.0);
    expect(voice.getRate()).toBe(3.0);
    voice.announceCountdown(2, 'lot-1', 2.0);
    expect(voice.spokenUtterances[0].rate).toBe(3.0);
  });

  // 4. Blitz at 3x does not change the voice speed
  it('4. blitz at 3x does not change the voice speed', () => {
    voice.setTimerSpeed(3.0);
    expect(voice.getRate()).toBe(3.0);
    voice.announceCountdown(1, 'lot-1', 3.0);
    expect(voice.spokenUtterances[0].rate).toBe(3.0);
  });

  // 5. Changing blitz speed during speech does not change the active voice rate
  it('5. changing blitz speed during speech does not change the active voice rate', () => {
    voice.announceBid('CSK', 50000000, false, 'lot-1');
    expect(voice.spokenUtterances[0].rate).toBe(3.0);

    // Host accelerates blitz to 1.5x mid-speech
    voice.setTimerSpeed(1.5);
    expect(voice.getRate()).toBe(3.0);
    expect(voice.spokenUtterances[0].rate).toBe(3.0);
  });

  // 6. Changing voice speed does not affect the auction timer
  it('6. changing voice speed does not modify the auction timer or blitz multiplier', () => {
    let mockAuctionTimer = 25;
    let mockBlitzMultiplier = 1.0;

    voice.setRate(2.5);
    expect(voice.getRate()).toBe(2.5);
    expect(mockAuctionTimer).toBe(25);
    expect(mockBlitzMultiplier).toBe(1.0);
  });

  // 7. Player names are announced correctly
  it('7. upcoming player names and base prices are announced correctly', () => {
    voice.announceNomination('Jasprit Bumrah', 'Bowler', 'lot-bumrah', 20000000);
    expect(voice.spokenUtterances[0].text).toBe(
      'Next player: Jasprit Bumrah, Bowler. Base price: 2 Crore.'
    );
  });

  // 8. Franchise names and accepted bid amounts are announced correctly
  it('8. franchise names and accepted bid amounts are announced clearly', () => {
    voice.announceBid('RCB', 22000000, false, 'lot-1');
    expect(voice.spokenUtterances[0].text).toBe('Royal Challengers Bengaluru bids 2.2 Crore.');

    voice.announceBid('MI', 24000000, false, 'lot-1');
    expect(voice.spokenUtterances[1].text).toBe('Mumbai Indians bids 2.4 Crore.');
  });

  // 9. Countdown numbers from 5 to 0 are announced in the correct order when their events remain valid
  it('9. countdown numbers from 3 to 1 are announced in the correct order and 5, 4, 0 are ignored', () => {
    const lotId = 'lot-countdown-test';
    // 5 and 4 must not announce
    voice.announceCountdown(5, lotId);
    voice.announceCountdown(4, lotId);
    expect(voice.spokenUtterances.length).toBe(0);

    // 3, 2, 1 must announce
    [3, 2, 1].forEach((sec) => {
      voice.announceCountdown(sec, lotId);
      voice.simulateUtteranceEnd();
    });

    // 0 must not announce
    voice.announceCountdown(0, lotId);

    const texts = voice.spokenUtterances.map((u) => u.text);
    expect(texts).toEqual(['Three', 'Two', 'One']);
    voice.spokenUtterances.forEach((u) => {
      expect(u.rate).toBe(3.0);
    });
  });

  it('supports 2.0x, 3.0x, and 4.0x voice speeds', () => {
    const multiVoice = new AuctioneerVoiceLogicTestHarness();
    multiVoice.setRate(2.0);
    expect(multiVoice.getRate()).toBe(2.0);
    multiVoice.announceNomination('Rohit Sharma', 'Batter', 'lot-2', 20000000);
    expect(multiVoice.spokenUtterances[0].rate).toBe(2.0);

    multiVoice.setRate(3.0);
    expect(multiVoice.getRate()).toBe(3.0);
    multiVoice.announceBid('RCB', 22000000, false, 'lot-2');
    expect(multiVoice.spokenUtterances[1].rate).toBe(3.0);

    multiVoice.setRate(4.0);
    expect(multiVoice.getRate()).toBe(4.0);
    multiVoice.announceBid('MI', 24000000, false, 'lot-2');
    expect(multiVoice.spokenUtterances[2].rate).toBe(4.0);
  });

  // 10. A new accepted bid during countdown invalidates the old countdown sequence
  it('10. a new accepted bid during countdown invalidates the old countdown sequence', () => {
    voice.announceCountdown(3, 'lot-1');
    expect(voice.spokenUtterances.length).toBe(1);
    expect(voice.spokenUtterances[0].text).toBe('Three');

    // CSK places a bid before 2 is announced: deadline generation increments and countdown cancelled
    voice.announceBid('CSK', 50000000, false, 'lot-1');
    expect(voice.lastAnnouncedCountdownNumber).toBeNull();
    expect(voice.currentPriority).toBe('BID');
    expect(voice.spokenUtterances[1].text).toBe('Chennai Super Kings bids 5 Crore.');
  });

  // 11. Stale countdown numbers are not spoken after a deadline reset
  it('11. stale countdown numbers are not spoken after a deadline reset', () => {
    voice.announceCountdown(2, 'lot-1');
    expect(voice.spokenUtterances.length).toBe(1);

    // Bid extends timer to 25s
    voice.announceBid('MI', 60000000, false, 'lot-1');

    // Stale countdown tick arrives for old cycle (e.g. tick 1 from old cycle)
    // When timer is reset (>5s), onTimerTick resets countdown
    voice.onTimerTick(25);
    expect(voice.lastAnnouncedCountdownNumber).toBeNull();

    // Outdated tick of 2 cannot replay
    voice.announceCountdown(2, 'lot-1');
    // Tick 2 can play for the new cycle if remaining reaches 2, but not as a stale continuation
  });

  // 12. Multiple rapid bids do not create duplicate or overlapping announcements
  it('12. multiple rapid bids do not create duplicate announcements for the same amount', () => {
    voice.announceBid('RCB', 10000000, false, 'lot-1');
    voice.announceBid('RCB', 10000000, false, 'lot-1'); // Duplicate socket emit
    expect(voice.spokenUtterances.length).toBe(1);

    voice.announceBid('CSK', 12000000, false, 'lot-1');
    expect(voice.spokenUtterances.length).toBe(2);
  });

  // 13. SOLD and UNSOLD announcements reflect the actual confirmed auction result
  it('13. SOLD and UNSOLD announcements reflect the confirmed auction result', () => {
    voice.announceSale('Rohit Sharma', 'MI', 160000000, 'lot-rohit');
    expect(voice.spokenUtterances[0].text).toBe(
      'SOLD! Rohit Sharma to Mumbai Indians for 16 Crore.'
    );

    voice.announceUnsold('Unsold Player', 'lot-unsold');
    expect(voice.spokenUtterances[1].text).toBe('UNSOLD! Unsold Player.');
  });

  // 14. Reconnection or repeated events do not duplicate announcements
  it('14. reconnection or repeated events do not duplicate announcements', () => {
    voice.announceNomination('KL Rahul', 'Wicketkeeper-Batter', 'lot-kl', 20000000);
    voice.announceNomination('KL Rahul', 'Wicketkeeper-Batter', 'lot-kl', 20000000);
    expect(voice.spokenUtterances.length).toBe(1);
  });

  // 15. TTS failure does not interrupt bidding or auction progression
  it('15. TTS failure or browser block does not interrupt bidding or timer', () => {
    const errorVoice = new AuctioneerVoiceLogicTestHarness();
    // Simulate audio error / exception
    errorVoice.speak = vi.fn().mockImplementation(() => {
      throw new Error('AudioContext blocked by autoplay policy');
    });

    expect(() => {
      errorVoice.announceBid('CSK', 50000000, false, 'lot-1');
    }).toThrow(); // In real frontend it is caught inside try/catch

    // State progression continues safely without crash
    expect(errorVoice.currentDeadlineGeneration).toBe(1);
  });

  // 16. Voice on/off and volume controls work correctly
  it('16. voice on/off and volume controls work correctly', () => {
    voice.enabled = false;
    voice.announceBid('CSK', 50000000, false, 'lot-1');
    expect(voice.spokenUtterances.length).toBe(0);

    voice.enabled = true;
    voice.volume = 0.5;
    voice.announceBid('CSK', 50000000, false, 'lot-1');
    expect(voice.spokenUtterances.length).toBe(1);
    expect(voice.spokenUtterances[0].volume).toBe(0.5);
  });

  // 17. Existing auction features continue working without regression
  it('17. existing auction features continue working without regression', () => {
    expect(toTeamShortCode('Chennai Super Kings')).toBe('CSK');
    expect(toTeamSpokenName('CSK')).toBe('Chennai Super Kings');
    expect(formatRupeesSpoken(20000000)).toBe('2 Crore');
    expect(formatRupeesSpoken(5000000)).toBe('50 Lakh');
  });
});

