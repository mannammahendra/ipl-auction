// Ellie Goulding Voice Commentary Engine for IPL Auction
// Inspired by the British singer of "Love Me Like You Do"
// Ethereal, melodic soprano cadence with fast 1.5x cricket commentary pace

import { useAuctionStore } from './store';

export type VoicePack = 'ELLIE_GOULDING';

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
  private rate: number = 3.0; // 3x fast commentary cadence as requested
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
          this.rate = parsed >= 1.5 ? parsed : 2.0;
        } else {
          this.rate = 2.0;
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

  public stop(): void {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
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
    this.rate = rate;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_rate', String(rate));
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
    }
  }

  public getTimerSpeed(): number {
    return this.activeTimerSpeed;
  }

  // Called on each timer tick to automatically track countdown tick speed and remaining seconds
  public onTimerTick(remainingSeconds: number, speedMultiplier?: number) {
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

  // Dynamically and automatically compute speech rate based on timer speed and bidding speed
  // Base rate is 3.0x (3x fast voice as requested), scaling with timer speed and bidding speed!
  public computeDynamicRate(options?: {
    isBid?: boolean;
    isCountdown?: boolean;
    timerSpeedMultiplier?: number;
    remainingSeconds?: number;
  }): number {
    const baseRate = this.rate || 3.0;

    // 1. TIMER SPEED FACTOR
    // Derived from store multiplier, parameter, and active timer speed
    let timerSpeed = options?.timerSpeedMultiplier || this.activeTimerSpeed;
    if (!timerSpeed && typeof window !== 'undefined') {
      try {
        timerSpeed = useAuctionStore.getState().speedMultiplier;
      } catch (e) {
        timerSpeed = 1.0;
      }
    }
    if (!timerSpeed || timerSpeed < 1.0) {
      timerSpeed = 1.0;
    }

    // 2. BIDDING SPEED FACTOR
    let biddingSpeedFactor = 1.0;
    if (options?.isBid) {
      const now = Date.now();
      const deltaMs = this.lastBidTime > 0 ? (now - this.lastBidTime) : 9999;
      this.lastBidTime = now;
      this.recentBidTimes.push(now);

      // Keep only bids from last 8 seconds
      this.recentBidTimes = this.recentBidTimes.filter((t) => now - t <= 8000);
      const bidsInLast8s = this.recentBidTimes.length;

      // Accelerated speech rate when bids arrive in rapid succession (bidding speed)
      if (deltaMs < 1000) {
        biddingSpeedFactor = 1.35; // Rapid bidding frenzy (<1s between bids)
      } else if (deltaMs < 2000) {
        biddingSpeedFactor = 1.20; // Quick succession (<2s)
      } else if (deltaMs < 3500) {
        biddingSpeedFactor = 1.10;
      }

      if (bidsInLast8s >= 3) {
        biddingSpeedFactor = Math.max(biddingSpeedFactor, 1.25);
      }
    }

    const isMobile = typeof navigator !== 'undefined' && (/android|iphone|ipad|ipod/i.test(navigator.userAgent));
    const maxSafeRate = isMobile ? 1.75 : 3.0;
    const minSafeRate = isMobile ? 1.1 : 1.5;

    if (options?.isCountdown) {
      const countdownRate = baseRate * timerSpeed;
      return Math.min(maxSafeRate, Math.max(minSafeRate, parseFloat(countdownRate.toFixed(2))));
    }

    // 3. COMBINE DYNAMICALLY: base rate * timer speed * bidding speed
    const calculatedRate = baseRate * timerSpeed * biddingSpeedFactor;

    return Math.min(maxSafeRate, Math.max(minSafeRate, parseFloat(calculatedRate.toFixed(2))));
  }

  // Fast, reliable vocalization engineered to keep pace with rapid bidding and countdowns
  public speak(text: string, forceLoud: boolean = false, overrideRate?: number) {
    if (!this.enabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {
      // ignore
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const profile = this.getActiveVoiceProfile();

    if (profile.voice) {
      utterance.voice = profile.voice;
    }
    utterance.pitch = profile.pitch;
    utterance.rate = overrideRate || profile.rate;
    utterance.volume = forceLoud ? 1.0 : this.volume;

    // Retain in memory to prevent Chrome GC bug cutting off utterance
    this.currentUtterance = utterance;
    utterance.onend = () => {
      this.currentUtterance = null;
    };
    utterance.onerror = () => {
      this.currentUtterance = null;
    };

    // Chromium requires a brief micro-delay after cancel() so the audio channel flushes cleanly
    this.pendingTimeout = setTimeout(() => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utterance);
        } catch (e) {}
      }
    }, 8);
  }

  // 1. Announce Player Coming to Podium: ONLY player name & type, brisk & punchy
  // e.g. "Virat Kohli, Batsman." or "MS Dhoni, Wicket-Keeper."
  public announceNomination(playerName: string, role: string) {
    let roleText = 'Batsman';
    if (role === 'WICKET_KEEPER') {
      roleText = 'Wicket-Keeper';
    } else if (role === 'BOWLER') {
      roleText = 'Bowler';
    } else if (role === 'ALL_ROUNDER') {
      roleText = 'All-Rounder';
    }
    this.speak(`${playerName}, ${roleText}.`, false, this.rate);
  }

  // 2. Announce Live Bid: Speak out Team and Amount in Ellie Goulding voice
  // e.g. "CSK 2 Crore" or "MI 40 Crore"
  // Automatically scales speed based on timer speed and bidding speed
  public announceBid(teamShortName: string, amount: number, timerSpeedMultiplier?: number) {
    if (!amount || amount <= 0) return;
    const dynamicRate = this.computeDynamicRate({
      isBid: true,
      timerSpeedMultiplier,
    });
    const price = this.formatRupeesSpoken(amount);
    const cleanTeam = this.normalizeTeamShort(teamShortName);
    // Fluent pronunciation without punctuation pause: e.g. "CSK 2 Crore"
    this.speak(`${cleanTeam} ${price}`, false, dynamicRate);
  }

  // 3. Timer Last 3 Seconds: Resonant rapid countdown automatically synchronized with timer speed
  // At 3: "Three", at 2: "Two", at 1: "One"
  public announceCountdown(seconds: number, timerSpeedMultiplier?: number) {
    const dynamicRate = this.computeDynamicRate({
      isCountdown: true,
      timerSpeedMultiplier,
      remainingSeconds: seconds,
    });
    if (seconds === 3) {
      this.speak('Three', true, dynamicRate);
    } else if (seconds === 2) {
      this.speak('Two', true, dynamicRate);
    } else if (seconds === 1) {
      this.speak('One', true, dynamicRate);
    }
  }

  // 4. Sold: ONLY "Sold to {team} for {amount}!"
  // e.g. "Sold to Chennai Super Kings for 14 Crore!"
  public announceSold(teamName: string, amount: number, timerSpeedMultiplier?: number) {
    const dynamicRate = this.computeDynamicRate({ timerSpeedMultiplier });
    const price = this.formatRupeesSpoken(amount);
    this.speak(`Sold to ${teamName} for ${price}!`, true, dynamicRate);
  }

  // 5. Unsold: (Disabled: all sounds when player was unsold removed)
  public announceUnsold() {
    // Disabled as requested: all sounds when player is unsold removed
  }

  // 6. Accelerated Round announcement
  public announceAcceleratedRound(round: number, timerSeconds: number) {
    this.speak(`Accelerated Round ${round} started! ${timerSeconds} seconds blitz timer!`, true, this.rate);
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
