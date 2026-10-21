// Ellie Goulding Voice Commentary Engine for IPL Auction
// Inspired by the British singer of "Love Me Like You Do"
// Natural, intelligible 1.0x commentary pace decoupled from Blitz speed

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

class AuctioneerVoiceService {
  private enabled: boolean = true;
  private voicePack: VoicePack = 'ELLIE_GOULDING';
  private rate: number = 1.0; // Natural 1x intelligible commentary speed as requested
  private pitch: number = 1.08; // Ellie Goulding airy melodic soprano pitch
  private volume: number = 1.0;
  private allVoices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private pendingTimeout: any = null;
  private lastBidTime: number = 0;
  private recentBidTimes: number[] = [];
  private lastTickTime: number = 0;
  private measuredTickInterval: number = 1000;
  private currentRemainingSeconds: number = 25;
  private activeTimerSpeed: number = 1.0;
  private pendingText: string | null = null;
  private lastAnnouncedCountdownNumber: number | null = null;
  private lastAnnouncedCountdownLotId: string | null = null;
  private lastAnnouncedBidKey: string | null = null;
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

        const savedRate = localStorage.getItem('ipl_voice_rate');
        if (savedRate) {
          const parsed = parseFloat(savedRate);
          this.rate = parsed >= 0.8 && parsed <= 1.5 ? parsed : 1.0;
        } else {
          this.rate = 1.0;
        }
        localStorage.setItem('ipl_voice_rate', String(this.rate));

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

  public getLastAnnouncedBidKey(): string | null {
    return this.lastAnnouncedBidKey;
  }

  public getCurrentPriority(): SpeechPriority | null {
    return this.currentPriority;
  }

  public getCountdownSpokenText(seconds: number): string | null {
    if (seconds >= 0 && seconds <= 5) {
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
    this.lastAnnouncedBidKey = null;
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
    return this.rate;
  }

  public setRate(rate: number) {
    if (rate >= 0.8 && rate <= 1.5) {
      this.rate = rate;
      if (typeof window !== 'undefined') {
        localStorage.setItem('ipl_voice_rate', String(rate));
      }
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
      return { voice: null, pitch: this.pitch, rate: this.rate };
    }

    const scored = this.allVoices.map((v) => ({
      voice: v,
      ...this.scoreEllieVoice(v),
    })).sort((a, b) => b.score - a.score);

    return {
      voice: scored[0]?.voice || null,
      pitch: this.pitch,
      rate: this.rate,
    };
  }

  public getDetectedVoiceLabel(): string {
    const profile = this.getActiveVoiceProfile();
    if (!profile.voice) return 'British English Female (Studio)';
    return `${profile.voice.name} (${profile.voice.lang})`;
  }

  // Convert numbers to clean spoken auction format (e.g. 20000000 -> "2 Crore", 400000000 -> "40 Crore", 25000000 -> "2.5 Crore")
  public formatRupeesSpoken(amount: number): string {
    if (!amount || amount <= 0) return '0';
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

  // Normalize team input to short uppercase code (e.g. CSK, MI, RCB)
  public normalizeTeamShort(rawName?: string): string {
    if (!rawName) return 'Bidder';
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
    return clean;
  }

  // Called to update the active timer speed (1.0x, 1.25x, 1.5x, 2.0x)
  public setTimerSpeed(speedMultiplier: number) {
    if (speedMultiplier && speedMultiplier >= 1.0) {
      this.activeTimerSpeed = speedMultiplier;
      // When Blitz speed changes mid-countdown, stop obsolete countdown speech
      // so next tick uses the new schedule without resetting the auction timer
      if (this.currentPriority === 'COUNTDOWN') {
        this.stopCountdown();
      }
    }
  }

  public getTimerSpeed(): number {
    return this.activeTimerSpeed;
  }

  // Called on each timer tick to automatically track countdown tick speed and remaining seconds
  public onTimerTick(remainingSeconds: number, speedMultiplier?: number) {
    if (remainingSeconds > 5) {
      this.resetCountdown();
    }
    const now = Date.now();
    if (this.lastTickTime > 0) {
      const delta = now - this.lastTickTime;
      // Filter out pauses/tab switching (reasonable tick intervals between 200ms and 2500ms)
      if (delta >= 200 && delta <= 2500) {
        this.measuredTickInterval = delta;
      }
    }
    this.lastTickTime = now;
    this.currentRemainingSeconds = remainingSeconds;
    if (speedMultiplier && speedMultiplier >= 1.0) {
      this.activeTimerSpeed = speedMultiplier;
    }
  }

  // Resets bidding cadence when a new player is nominated
  public resetBiddingCadence() {
    this.lastBidTime = 0;
    this.recentBidTimes = [];
  }

  // Returns rate for a given speech priority and speed multiplier:
  // ONLY countdown timing accelerates with Blitz speed!
  // Player nomination, bids, and sale results ALWAYS speak at natural 1x rate.
  public computeDynamicRate(priority: SpeechPriority, speedMultiplier?: number): number {
    const base = this.rate || 1.0;
    if (priority === 'COUNTDOWN') {
      const mult = Math.max(1.0, speedMultiplier || this.activeTimerSpeed || 1.0);
      const computed = parseFloat((base * mult).toFixed(2));
      return Math.min(2.5, Math.max(1.0, computed));
    }
    // Nomination, Bid, Result: always natural base rate (1.0x)
    return base;
  }

  // Fast, reliable vocalization engineered with priority hierarchy
  public speak(
    text: string,
    forceLoud: boolean = false,
    overrideRate?: number,
    priority: SpeechPriority = 'BID',
    speedMultiplier?: number
  ) {
    if (!this.enabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    // State & Phase Transition Rules:
    // 1. A new NOMINATION represents a new lot state — it invalidates previous speech (including RESULT from earlier lot)
    if (priority === 'NOMINATION') {
      this.currentPriority = 'NOMINATION';
    } else if (priority === 'RESULT') {
      // Sale or Unsold result invalidates live bids and countdowns
      this.currentPriority = 'RESULT';
    } else if (priority === 'BID') {
      // Bids cannot override hammer result
      if (this.currentPriority === 'RESULT') {
        return;
      }
      this.currentPriority = 'BID';
    } else if (priority === 'COUNTDOWN') {
      // Countdown must never interrupt nomination or sale result
      if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'RESULT') {
        return;
      }
      // If voice is currently actively speaking a countdown number, skip outdated intermediate numbers
      if (this.currentPriority === 'COUNTDOWN' && (this.isSpeakingActive || (typeof window !== 'undefined' && window.speechSynthesis?.speaking))) {
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

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}

    const effectiveRate = overrideRate !== undefined
      ? overrideRate
      : this.computeDynamicRate(priority, speedMultiplier);

    const utterance = new SpeechSynthesisUtterance(text);
    const profile = this.getActiveVoiceProfile();

    if (profile.voice) {
      utterance.voice = profile.voice;
    }
    utterance.pitch = profile.pitch;
    utterance.rate = effectiveRate;
    utterance.volume = forceLoud ? 1.0 : this.volume;

    // Retain in memory to prevent Chrome GC bug cutting off utterance
    this.currentUtterance = utterance;
    this.isSpeakingActive = true;

    utterance.onstart = () => {
      this.isSpeakingActive = true;
      this.pendingText = null;
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
    };

    // Safety timeout to avoid priority deadlocks if browser never fires onend
    const activeMult = Math.max(1.0, speedMultiplier || this.activeTimerSpeed || 1.0);
    const safetyMs = priority === 'COUNTDOWN'
      ? Math.max(300, Math.round(900 / activeMult))
      : priority === 'BID'
      ? 2500
      : 3500;

    this.prioritySafetyTimeout = setTimeout(() => {
      this.isSpeakingActive = false;
      if (this.currentPriority === priority) {
        this.currentPriority = null;
      }
    }, safetyMs);

    // Brief delay so audio channel flushes cleanly
    this.pendingTimeout = setTimeout(() => {
      this.pendingTimeout = null;
      if (typeof window !== 'undefined' && window.speechSynthesis && this.enabled) {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utterance);
        } catch (e) {}
      }
    }, 10);
  }

  // 1. Announce Player Coming to Podium: Full player name & type, natural 1x speaking rate
  // e.g. "Virat Kohli, Batsman." or "Jasprit Bumrah, Bowler."
  public announceNomination(playerName: string, role?: string, lotId?: string) {
    if (!this.enabled) return;

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
    this.speak(text, false, this.rate, 'NOMINATION');
  }

  // 2. Announce Live Bid: Speak out Team and Amount in natural 1x voice
  // e.g. "CSK 2 Crore" or "MI 40 Crore"
  public announceBid(teamShortName: string, amount: number, lotId?: string) {
    if (!amount || amount <= 0) return;
    this.stopCountdown();

    const cleanTeam = this.normalizeTeamShort(teamShortName);
    const bidKey = `${lotId || 'current'}_${cleanTeam}_${amount}`;
    if (this.lastAnnouncedBidKey === bidKey) {
      return;
    }
    this.lastAnnouncedBidKey = bidKey;

    const price = this.formatRupeesSpoken(amount);
    // Fluent pronunciation without punctuation pause: e.g. "CSK 2 Crore"
    this.speak(`${cleanTeam} ${price}`, false, this.rate, 'BID');
  }

  // 3. Final countdown: 5 to 0 accelerated with Blitz timer speed (1x, 1.25x, 1.5x, 2x)
  // If nomination or sale is active, skips countdown to preserve critical speech
  public announceCountdown(seconds: number, lotId?: string, speedMultiplier?: number) {
    if (!this.enabled || seconds < 0 || seconds > 5) return;

    if (speedMultiplier && speedMultiplier >= 1.0) {
      this.activeTimerSpeed = speedMultiplier;
    }

    // Critical announcements take precedence: never interrupt nomination or sale results
    if (this.currentPriority === 'NOMINATION' || this.currentPriority === 'RESULT') {
      return;
    }

    // Reset countdown sequence if lot changed
    if (lotId && lotId !== this.lastAnnouncedCountdownLotId) {
      this.lastAnnouncedCountdownLotId = lotId;
      this.lastAnnouncedCountdownNumber = null;
    }

    // Drop duplicate ticks for the same second
    if (this.lastAnnouncedCountdownNumber === seconds) {
      return;
    }

    // Drop stale ticks (e.g. delayed out-of-order network ticks that arrive after a lower tick was already announced)
    if (this.lastAnnouncedCountdownNumber !== null && seconds > this.lastAnnouncedCountdownNumber) {
      return;
    }

    // If speech cannot finish before countdown advances (e.g. at Blitz speeds):
    // Skip outdated countdown numbers instead of interrupting or queuing late!
    if (this.currentPriority === 'COUNTDOWN' && (this.isSpeakingActive || (typeof window !== 'undefined' && window.speechSynthesis?.speaking))) {
      return;
    }

    this.lastAnnouncedCountdownNumber = seconds;

    const spokenText = this.getCountdownSpokenText(seconds);
    if (spokenText) {
      const mult = speedMultiplier || this.activeTimerSpeed || 1.0;
      const rate = this.computeDynamicRate('COUNTDOWN', mult);
      this.speak(spokenText, true, rate, 'COUNTDOWN', mult);
    }
  }

  // 4. Sold: Clearly announce player name, winning franchise, and final sale amount
  // e.g. "Sold! Virat Kohli to Royal Challengers Bengaluru for 21 Crore!"
  public announceSold(playerName: string, teamName: string, amount: number) {
    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
    const price = this.formatRupeesSpoken(amount);
    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    const cleanTeam = teamName && teamName.trim() ? teamName.trim() : 'Winning Franchise';
    this.speak(`Sold! ${cleanPlayer} to ${cleanTeam} for ${price}!`, true, this.rate, 'RESULT');
  }

  // 5. Unsold: Announce player unsold result
  // e.g. "Steve Smith unsold."
  public announceUnsold(playerName?: string) {
    this.stopCountdown();
    this.lastAnnouncedBidKey = null;
    const cleanPlayer = playerName && playerName.trim() ? playerName.trim() : 'Player';
    this.speak(`${cleanPlayer} unsold.`, true, this.rate, 'RESULT');
  }

  // 6. Accelerated Round announcement
  public announceAcceleratedRound(round: number, timerSeconds: number) {
    this.speak(`Accelerated Round ${round} started! ${timerSeconds} seconds blitz timer!`, true, this.rate);
  }

  // 6b. Round Completed announcement
  public announceRoundCompleted(round: number, unsoldAvailable: number, intermissionSeconds: number) {
    this.speak(`Round ${round} completed. ${unsoldAvailable} unsold players returning for Accelerated Round in ${intermissionSeconds} seconds!`, true, this.rate);
  }

  // 7. Player Recalled announcement
  public announcePlayerRecalled(playerName: string) {
    this.speak(`${playerName} recalled to the auction pool!`, true, this.rate);
  }

  // Preview test speech
  public testCurrentVoice() {
    this.speak('CSK, 2 Crore. MI, 40 Crore. Sold to Chennai Super Kings!', false, this.rate);
  }
}

export const auctioneerVoice = new AuctioneerVoiceService();
