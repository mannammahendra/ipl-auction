// Ellie Goulding Voice Commentary Engine for IPL Auction
// Inspired by the British singer of "Love Me Like You Do"
// Fast 3.0x commentary pace independent of Blitz

import { useAuctionStore } from './store';

export type VoicePack = 'ELLIE_GOULDING';

export type SpeechPriority = 'COUNTDOWN' | 'BID' | 'NOMINATION' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  COUNTDOWN: 1,
  BID: 2,
  NOMINATION: 3,
  RESULT: 4,
};

export interface ScoredVoice {
  voice: SpeechSynthesisVoice;
  score: number;
  isNatural: boolean;
  isBritish: boolean;
  label: string;
}

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

class AuctioneerVoiceService {
  private enabled: boolean = true;
  private voicePack: VoicePack = 'ELLIE_GOULDING';
  private rate: number = 3.0; // Fixed 3.0x commentary pace as requested
  private pitch: number = 1.08; // Ellie Goulding airy melodic soprano pitch
  private volume: number = 1.0;
  private allVoices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private pendingTimeout: any = null;
  private currentRemainingSeconds: number = 25;
  private pendingText: string | null = null;
  private lastAnnouncedCountdownNumber: number | null = null;
  private lastAnnouncedCountdownLotId: string | null = null;
  private lastCountdownSpokenAt: number = 0;
  private lastAnnouncedBidKey: string | null = null;
  private lastAnnouncedSaleKey: string | null = null;
  private currentPriority: SpeechPriority | null = null;
  private prioritySafetyTimeout: any = null;
  private isSpeakingActive: boolean = false;
  private announcedNominationLots = new Set<string>();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedEnabled = localStorage.getItem('ipl_voice_enabled');
        if (savedEnabled !== null) {
          this.enabled = savedEnabled === 'true';
        }
        this.voicePack = 'ELLIE_GOULDING';
        localStorage.setItem('ipl_voice_pack', 'ELLIE_GOULDING');

        this.rate = 3.0;
        localStorage.setItem('ipl_voice_rate', '3.0');

        const savedPitch = localStorage.getItem('ipl_voice_pitch');
        if (savedPitch) {
          this.pitch = parseFloat(savedPitch) || 1.08;
        } else {
          this.pitch = 1.08;
        }
      } catch {}

      this.initVoices();
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.initVoices();
          if (this.pendingText) {
            const t = this.pendingText;
            this.pendingText = null;
            this.speak(t);
          }
        };
      }

      // Proactively unlock speech synthesis on very first touch or click
      const autoUnlock = () => {
        this.unlockAudio();
        window.removeEventListener('click', autoUnlock);
        window.removeEventListener('touchstart', autoUnlock);
        window.removeEventListener('pointerdown', autoUnlock);
      };
      window.addEventListener('click', autoUnlock, { once: true });
      window.addEventListener('touchstart', autoUnlock, { once: true });
      window.addEventListener('pointerdown', autoUnlock, { once: true });
    }
  }

  public unlockAudio() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      this.initVoices();
      const warmup = new SpeechSynthesisUtterance('');
      warmup.volume = 0;
      window.speechSynthesis.speak(warmup);

      if (this.pendingText) {
        const t = this.pendingText;
        this.pendingText = null;
        this.speak(t);
      }
    } catch (e) {}
  }

  public initVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    this.allVoices = window.speechSynthesis.getVoices() || [];
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_enabled', String(val));
      if (!val && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }

  public resetCountdown(): void {
    this.lastAnnouncedCountdownNumber = null;
  }

  public stopCountdown(): void {
    this.resetCountdown();
    // Only cancel speech synthesis if countdown was the active speech
    if (this.currentPriority === 'COUNTDOWN') {
      if (this.pendingTimeout) {
        clearTimeout(this.pendingTimeout);
        this.pendingTimeout = null;
      }
      this.isSpeakingActive = false;
      this.currentPriority = null;
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch (e) {}
      }
    }
  }

  public isSpeaking(): boolean {
    return this.isSpeakingActive;
  }

  public getLastAnnouncedCountdownNumber(): number | null {
    return this.lastAnnouncedCountdownNumber;
  }

  public getCurrentPriority(): SpeechPriority | null {
    return this.currentPriority;
  }

  public getCountdownSpokenText(seconds: number): string | null {
    if (seconds >= 1 && seconds <= 3) {
      return String(seconds);
    }
    return null;
  }

  public stop(): void {
    if (this.prioritySafetyTimeout) {
      clearTimeout(this.prioritySafetyTimeout);
      this.prioritySafetyTimeout = null;
    }
    this.isSpeakingActive = false;
    this.currentPriority = null;
    this.resetCountdown();
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public getVoicePack(): VoicePack {
    return 'ELLIE_GOULDING';
  }

  public setVoicePack(_pack: VoicePack) {
    this.voicePack = 'ELLIE_GOULDING';
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_pack', 'ELLIE_GOULDING');
    }
  }

  public getSelectedVoiceURI(): string | null {
    return null;
  }

  public setSelectedVoiceURI(_uri: string | null) {
    // Single dedicated Ellie Goulding voice profile
  }

  public getRate(): number {
    return 3.0;
  }

  public setRate(_rate: number) {
    this.rate = 3.0;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_rate', '3.0');
    }
  }

  public getPitch(): number {
    return this.pitch;
  }

  public setPitch(pitch: number) {
    this.pitch = pitch;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_pitch', String(pitch));
    }
  }

  public getVoiceName(): string {
    return 'Ellie Goulding (Love Me Like You Do)';
  }

  // Detect whether a voice is female by common names & attributes
  private checkFemale(name: string): boolean {
    const n = name.toLowerCase();
    const femaleKeywords = [
      'female', 'libby', 'sonia', 'mia', 'maisie', 'hazel', 'susan', 'victoria',
      'fiona', 'jenny', 'aria', 'zira', 'samantha', 'karen', 'moira', 'veena',
      'priya', 'catherine', 'neerja', 'ava', 'serena', 'alva', 'alice', 'emma',
      'anna', 'stephanie', 'clara', 'sarah', 'zoe', 'natasha', 'lucy', 'chloe'
    ];
    const maleKeywords = ['male', 'david', 'mark', 'george', 'oliver', 'guy', 'ryan', 'james', 'richard'];
    if (maleKeywords.some((m) => n.includes(m))) return false;
    return femaleKeywords.some((k) => n.includes(k));
  }

  // Score voice specifically for Ellie Goulding's British female pop vocalist style
  private scoreEllieVoice(voice: SpeechSynthesisVoice): { score: number; isNatural: boolean; isBritish: boolean } {
    const n = voice.name.toLowerCase();
    const lang = voice.lang.toLowerCase();
    let score = 0;
    let isNatural = false;

    const isFem = this.checkFemale(voice.name);
    if (!isFem) score -= 600;

    // Highest priority: British English (en-GB) matching Ellie Goulding
    const isBritish = lang.includes('en-gb') || lang.includes('en_gb') || lang.includes('uk') || n.includes('united kingdom') || n.includes('great britain');
    if (isBritish) {
      score += 450;
      if (isFem) score += 350;
    } else if (lang.startsWith('en')) {
      score += 180;
      if (isFem) score += 120;
    }

    if (n.includes('online (natural)') || n.includes('natural')) {
      score += 300;
      isNatural = true;
    } else if (n.includes('neural')) {
      score += 260;
      isNatural = true;
    } else if (n.includes('google')) {
      score += 220;
      isNatural = true;
    } else if (n.includes('studio') || n.includes('enhanced') || n.includes('premium')) {
      score += 180;
      isNatural = true;
    }

    // Top tier British female natural voices
    if (n.includes('libby')) score += 250;
    if (n.includes('sonia')) score += 220;
    if (n.includes('mia')) score += 200;
    if (n.includes('maisie')) score += 180;
    if (n.includes('hazel')) score += 150;
    if (n.includes('susan')) score += 140;

    if (n.includes('desktop')) score -= 180;

    return { score, isNatural, isBritish };
  }

  // Get active Ellie Goulding voice profile
  public getActiveVoiceProfile(): { voice: SpeechSynthesisVoice | null; pitch: number; rate: number } {
    if (this.allVoices.length === 0) {
      this.initVoices();
    }
    if (this.allVoices.length === 0) {
      return { voice: null, pitch: this.pitch, rate: 3.0 };
    }

    const scored = this.allVoices.map((v) => ({
      voice: v,
      ...this.scoreEllieVoice(v),
    })).sort((a, b) => b.score - a.score);

    return {
      voice: scored[0]?.voice || null,
      pitch: this.pitch,
      rate: 3.0,
    };
  }

  public getDetectedVoiceLabel(): string {
    const profile = this.getActiveVoiceProfile();
    if (!profile.voice) return 'British English Female (Studio)';
    return `${profile.voice.name} (${profile.voice.lang})`;
  }

  // Convert numbers to clean spoken auction format
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

  // Normalize team input
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

  // No-op: independent of Blitz
  public setTimerSpeed(_speedMultiplier: number) {}

  public getTimerSpeed(): number {
    return 1.0;
  }

  // Called on each timer tick to reset countdown state if above 3s
  public onTimerTick(remainingSeconds: number) {
    if (remainingSeconds > 3) {
      this.resetCountdown();
    }
    this.currentRemainingSeconds = remainingSeconds;
  }

  public resetBiddingCadence() {}

  // Fixed 3.0x speed independent of Blitz
  public computeDynamicRate(): number {
    return 3.0;
  }

  // Fast, reliable vocalization at 3.0x speed
  public speak(
    text: string,
    forceLoud: boolean = false,
    priority: SpeechPriority = 'COUNTDOWN'
  ) {
    if (!this.enabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    // State & Phase Transition Rules:
    // 1. A new NOMINATION represents a new lot state — it invalidates previous speech (including RESULT from earlier lot)
    if (priority === 'NOMINATION') {
      this.currentPriority = 'NOMINATION';
      try {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {}
    } else if (priority === 'RESULT') {
      // Sale result invalidates countdowns and pending bids
      this.currentPriority = 'RESULT';
      try {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {}
    } else if (priority === 'BID') {
      // Confirmed sale result takes precedence
      if (this.currentPriority === 'RESULT') {
        return;
      }
      this.currentPriority = 'BID';
      // Prioritize newest accepted bid promptly without backlog
      try {
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (e) {}
    } else if (priority === 'COUNTDOWN') {
      // Countdown must never interrupt nomination, bid, or sale result
      if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'BID' || this.currentPriority === 'RESULT') {
        return;
      }
      this.currentPriority = 'COUNTDOWN';
    }

    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    if (this.prioritySafetyTimeout) {
      clearTimeout(this.prioritySafetyTimeout);
      this.prioritySafetyTimeout = null;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const profile = this.getActiveVoiceProfile();

    if (profile.voice) {
      utterance.voice = profile.voice;
    }
    utterance.pitch = profile.pitch;
    utterance.rate = 3.0; // Strictly apply 3.0x speed directly to every utterance
    utterance.volume = forceLoud ? 1.0 : this.volume;

    // Retain in memory to prevent Chrome GC bug cutting off utterance
    this.currentUtterance = utterance;
    this.isSpeakingActive = true;

    utterance.onstart = () => {
      this.isSpeakingActive = true;
      this.pendingText = null;
      console.log(`[Speech] Started speaking: "${text}" (${priority}, rate=3.0x)`);
    };
    utterance.onend = () => {
      this.currentUtterance = null;
      this.isSpeakingActive = false;
      if (this.prioritySafetyTimeout) {
        clearTimeout(this.prioritySafetyTimeout);
        this.prioritySafetyTimeout = null;
      }
      if (this.currentPriority === priority) {
        this.currentPriority = null;
      }
      console.log(`[Speech] Finished speaking: "${text}" (${priority})`);
    };
    utterance.onerror = (e) => {
      this.currentUtterance = null;
      this.isSpeakingActive = false;
      if (this.prioritySafetyTimeout) {
        clearTimeout(this.prioritySafetyTimeout);
        this.prioritySafetyTimeout = null;
      }
      if (this.currentPriority === priority) {
        this.currentPriority = null;
      }
      if (e.error === 'not-allowed') {
        this.pendingText = text;
      }
      console.warn(`[Speech] Speech error: "${e.error}" for "${text}"`);
    };

    // Fast 3.0x speech safety timeouts (prevents locks without waiting)
    const safetyMs = priority === 'COUNTDOWN' ? 450 : priority === 'BID' ? 800 : 2000;
    this.prioritySafetyTimeout = setTimeout(() => {
      this.isSpeakingActive = false;
      if (this.currentPriority === priority) {
        this.currentPriority = null;
      }
    }, safetyMs);

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  }

  // 1. Timer: Announce countdown numbers (only 3, 2, 1) at 3.0x speed
  public announceCountdown(seconds: number, lotId?: string, speedMultiplier: number = 1.0) {
    console.log(`[Countdown] Event received: remainingSeconds=${seconds}, blitz=${speedMultiplier}x, lotId=${lotId || 'none'}`);

    if (!this.enabled) {
      console.log(`[Countdown] Skipped number ${seconds}: voice disabled`);
      return;
    }
    // Strictly announce countdown only for 3, 2, 1 (do not announce 5, 4, 0)
    if (seconds < 1 || seconds > 3) return;

    // Critical announcements take precedence: never interrupt nomination, live bids, or sale results
    if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'BID' || this.currentPriority === 'RESULT') {
      console.log(`[Countdown] Skipped number ${seconds}: higher priority '${this.currentPriority}' active`);
      return;
    }

    // Reset countdown sequence if lot changed
    if (lotId && lotId !== this.lastAnnouncedCountdownLotId) {
      this.lastAnnouncedCountdownLotId = lotId;
      this.lastAnnouncedCountdownNumber = null;
    }

    // Drop duplicate ticks for the same second
    if (this.lastAnnouncedCountdownNumber === seconds) {
      console.log(`[Countdown] Skipped number ${seconds}: duplicate tick`);
      return;
    }

    // Drop stale higher ticks
    if (this.lastAnnouncedCountdownNumber !== null && seconds > this.lastAnnouncedCountdownNumber) {
      console.log(`[Countdown] Skipped number ${seconds}: stale tick (last was ${this.lastAnnouncedCountdownNumber})`);
      return;
    }

    // Check if voice is genuinely still active from a previous countdown number
    const now = Date.now();
    const timeSinceLastCountdown = now - this.lastCountdownSpokenAt;
    // Single digit at 3.0x takes ~120ms. If at least 320ms have passed, the user has heard the previous digit.
    if (this.currentPriority === 'COUNTDOWN' && this.isSpeakingActive && timeSinceLastCountdown < 320) {
      console.warn(`[Countdown] Skipped number ${seconds}: browser speech synthesis still rendering previous digit (${timeSinceLastCountdown}ms elapsed)`);
      return;
    }

    this.lastAnnouncedCountdownNumber = seconds;
    this.lastCountdownSpokenAt = now;

    const spokenText = this.getCountdownSpokenText(seconds);
    if (spokenText) {
      console.log(`[Countdown] Queued number ${seconds} for speech at 3.0x`);
      this.speak(spokenText, true, 'COUNTDOWN');
    }
  }

  // 2. Player name: Announce player name and mapped role clearly at 3.0x speed
  // Format: "Next player: [Player Name], [Player Role]."
  public announceNomination(playerName: string, playerRole?: string, lotId?: string) {
    if (!this.enabled) return;

    if (!playerName || !playerName.trim()) return;

    // Deduplication: Only announce once per genuine nomination lot
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
      console.warn(`[AuctionVoice] Unmapped or unrecognized player role: "${playerRole}" for player "${cleanPlayer}"`);
    } else if (!playerRole) {
      console.warn(`[AuctionVoice] Missing player role for player "${cleanPlayer}"`);
    }

    const spokenText = mappedRole
      ? `Next player: ${cleanPlayer}, ${mappedRole}.`
      : `Next player: ${cleanPlayer}.`;

    console.log(`[AuctionVoice] Nomination announced: "${spokenText}" (lot: ${lotId || 'unknown'})`);
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

    // Bids take priority over countdown; cancel countdown immediately
    this.stopCountdown();

    const spokenText = `${team}, ${amountStr}.`;
    console.log(`[AuctionVoice] Bid announced: "${spokenText}"`);

    // Priority 'BID' cancels prior speech backlog to prioritize newest accepted bid
    this.speak(spokenText, false, 'BID');
  }

  // 4. Player sold: “[Player Name] sold to [Franchise Name].” at 3.0x speed
  // e.g. "MS Dhoni sold to CSK." (no final sale amount, no sound effects, no repeat)
  public announceSold(playerName: string, teamName: string, saleKey?: string) {
    if (!this.enabled) return;

    const key = saleKey || `${playerName}_${teamName}`;
    if (this.lastAnnouncedSaleKey === key) {
      return; // Do not repeat sale announcement
    }
    this.lastAnnouncedSaleKey = key;

    this.stopCountdown();
    this.lastAnnouncedBidKey = null;

    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    const cleanTeam = toTeamShortCode(teamName);
    const spokenText = `${cleanPlayer} sold to ${cleanTeam}.`;

    console.log(`[AuctionVoice] Sale announced: "${spokenText}"`);
    this.speak(spokenText, true, 'RESULT');
  }

  public announceUnsold(_playerName?: string) {}
  public announceAcceleratedRound(_round?: number, _timerSeconds?: number) {}
  public announceRoundCompleted(_round?: number, _unsoldAvailable?: number, _intermissionSeconds?: number) {}
  public announcePlayerRecalled(_playerName?: string) {}

  public testCurrentVoice() {
    this.speak('Next player: Virat Kohli, Batter.', false, 'NOMINATION');
  }
}

export const auctioneerVoice = new AuctioneerVoiceService();

