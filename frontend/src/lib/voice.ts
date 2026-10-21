// Cricket Auction Voice Announcement Engine
// Dedicated Single Female English Auctioneer Voice @ 3.0x / 4.0x / 2.0x Speeds
// Independent of blitz countdown timer, zero settings complexity, one-click mute/unmute
// Strict 3 to 1 countdown sequence with reliable per-second delivery

export type SpeechPriority = 'INFO' | 'NOMINATION' | 'BID' | 'COUNTDOWN' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  INFO: 1,
  NOMINATION: 2,
  BID: 3,
  COUNTDOWN: 4,
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

class AuctioneerVoiceService {
  private enabled: boolean = true;
  private rate: number = 3.0; // Voice speed, default 3.0x, supports 2.0x, 3.0x, 4.0x
  private readonly pitch: number = 1.0; // Normal natural pitch
  private readonly volume: number = 0.85; // 85% volume
  private readonly countdownEnabled: boolean = true;
  private allVoices: SpeechSynthesisVoice[] = [];
  private dedicatedVoice: SpeechSynthesisVoice | null = null;
  private activeUtterances = new Set<SpeechSynthesisUtterance>(); // Prevents V8 GC collection
  private currentPriority: SpeechPriority | null = null;
  private isSpeakingActive: boolean = false;
  private pendingTimeout: any = null;
  private prioritySafetyTimeout: any = null;
  private pendingText: string | null = null;
  private lastAnnouncedCountdownNumber: number | null = null;
  private lastAnnouncedCountdownLotId: string | null = null;
  private currentDeadlineGeneration: number = 0;
  private lastAnnouncedBidKey: string | null = null;
  private lastAnnouncedSaleKey: string | null = null;
  private announcedNominationLots = new Set<string>();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedEnabled = localStorage.getItem('ipl_voice_enabled');
        if (savedEnabled !== null) {
          this.enabled = savedEnabled === 'true';
        }

        const savedRate = localStorage.getItem('ipl_voice_rate');
        if (savedRate) {
          const parsed = parseFloat(savedRate);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 4) {
            this.rate = parsed;
          }
        } else {
          this.rate = 3.0;
        }
      } catch {}

      this.initVoices();
      if (typeof window.speechSynthesis !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = () => {
          this.initVoices();
          if (this.pendingText) {
            const textToSpeak = this.pendingText;
            this.pendingText = null;
            this.speak(textToSpeak, this.currentPriority || 'INFO');
          }
        };
      }

      // Proactively unlock and resume speech synthesis on user interaction
      const autoUnlock = () => {
        this.unlockAudio();
      };
      window.addEventListener('click', autoUnlock, { passive: true });
      window.addEventListener('touchstart', autoUnlock, { passive: true });
      window.addEventListener('pointerdown', autoUnlock, { passive: true });
      window.addEventListener('keydown', autoUnlock, { passive: true });
    }
  }

  public unlockAudio() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      this.initVoices();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}
  }

  public initVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        this.allVoices = v;
        this.dedicatedVoice = null; // Re-evaluate voice on voice list reload
        this.getDedicatedFemaleEnglishVoice();
      }
    } catch {}
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.allVoices.length === 0 && typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) {
          this.allVoices = v;
        }
      } catch {}
    }
    return this.allVoices;
  }

  // Exactly ONE Dedicated Female English Voice across all operating systems & browsers
  public getDedicatedFemaleEnglishVoice(): SpeechSynthesisVoice | null {
    if (this.dedicatedVoice) {
      return this.dedicatedVoice;
    }

    const voices = this.getVoices();
    if (!voices || voices.length === 0) return null;

    // Platform-specific female voice keywords:
    // Windows: "Microsoft Zira Desktop" / "Microsoft Zira - English (United States)"
    // macOS / iOS: "Samantha", "Victoria", "Karen", "Tessa", "Moira", "Fiona"
    // Chrome / Android: "Google US English Female", "Google UK English Female", "Natural"
    // Edge: "Microsoft Jenny Online (Natural)", "Microsoft Aria Online (Natural)"
    const femaleKeywords = [
      'zira',
      'samantha',
      'victoria',
      'karen',
      'tessa',
      'moira',
      'fiona',
      'aria',
      'jenny',
      'heera',
      'kavya',
      'veena',
      'neerja',
      'aditi',
      'female',
      'woman',
      'girl',
    ];

    // 1. Highest priority: English voice matching female keywords
    for (const v of voices) {
      const lang = (v.lang || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      if (lang.startsWith('en') && femaleKeywords.some((kw) => name.includes(kw))) {
        this.dedicatedVoice = v;
        return v;
      }
    }

    // 2. Secondary: Any voice matching female keywords
    for (const v of voices) {
      const name = (v.name || '').toLowerCase();
      if (femaleKeywords.some((kw) => name.includes(kw))) {
        this.dedicatedVoice = v;
        return v;
      }
    }

    // 3. Fallback: Any English voice
    const anyEnglish = voices.find((v) => (v.lang || '').toLowerCase().startsWith('en'));
    if (anyEnglish) {
      this.dedicatedVoice = anyEnglish;
      return anyEnglish;
    }

    // 4. Default: First available voice
    this.dedicatedVoice = voices[0] || null;
    return this.dedicatedVoice;
  }

  // Alias for backward compatibility
  public getBestIndianFemaleVoice(): SpeechSynthesisVoice | null {
    return this.getDedicatedFemaleEnglishVoice();
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ipl_voice_enabled', String(val));
      } catch {}
      if (!val && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
        } catch {}
      } else if (val) {
        this.unlockAudio();
      }
    }
  }

  public toggle(): boolean {
    const next = !this.enabled;
    this.setEnabled(next);
    if (next) {
      this.unlockAudio();
      this.speak('Voice commentary enabled', 'INFO');
    }
    return next;
  }

  public getRate(): number {
    return this.rate;
  }

  public setRate(rate: number) {
    const cleanRate = Math.min(4.0, Math.max(1.0, rate || 3.0));
    this.rate = cleanRate;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ipl_voice_rate', String(cleanRate));
      } catch {}
    }
  }

  public getPitch(): number {
    return this.pitch;
  }

  public getVolume(): number {
    return this.volume;
  }

  public isCountdownEnabled(): boolean {
    return this.countdownEnabled;
  }

  public getVoiceName(): string {
    const voice = this.getDedicatedFemaleEnglishVoice();
    if (!voice) return 'Female English (Default)';
    return voice.name;
  }

  // Timer speed changes must NEVER change voice speed
  public setTimerSpeed(_multiplier?: number) {
    void _multiplier;
    // Intentionally independent from blitz speed
  }

  public computeDynamicRate(): number {
    return this.rate;
  }

  public isSpeaking(): boolean {
    return this.isSpeakingActive;
  }

  public getCurrentPriority(): SpeechPriority | null {
    return this.currentPriority;
  }

  public getLastAnnouncedCountdownNumber(): number | null {
    return this.lastAnnouncedCountdownNumber;
  }

  public stop(): void {
    if (this.prioritySafetyTimeout) {
      clearTimeout(this.prioritySafetyTimeout);
      this.prioritySafetyTimeout = null;
    }
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }
    this.isSpeakingActive = false;
    this.currentPriority = null;
    this.resetCountdown();
    this.activeUtterances.clear();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  public resetCountdown(): void {
    this.lastAnnouncedCountdownNumber = null;
  }

  // Invalidate any ongoing or pending countdown announcements immediately
  public stopCountdown(): void {
    this.resetCountdown();
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
        } catch {}
      }
    }
  }

  // Reset countdown tracking when timer exceeds 3 seconds
  public onTimerTick(remainingSeconds: number) {
    if (remainingSeconds > 3) {
      this.resetCountdown();
    }
  }

  // Announce strictly numbers from 3 to 1 (not 5 to 0)
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

  public speak(text: string, priority: SpeechPriority = 'INFO'): void {
    if (!this.enabled || !text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Always ensure synthesis is resumed
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}

    const currentPrioNum = this.currentPriority ? PRIORITY_ORDER[this.currentPriority] : 0;
    const newPrioNum = PRIORITY_ORDER[priority];

    // If higher priority announcement is currently speaking, do not interrupt with lower priority
    // (Except RESULT which always has highest priority, or COUNTDOWN when timer is critical)
    if (this.isSpeakingActive && currentPrioNum > newPrioNum && priority !== 'RESULT') {
      return;
    }

    // High priority events (RESULT, COUNTDOWN, BID, NOMINATION) interrupt lower/equal priority speech
    if (this.isSpeakingActive || window.speechSynthesis.speaking) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout);
      this.pendingTimeout = null;
    }

    this.currentPriority = priority;
    this.isSpeakingActive = true;

    if (this.prioritySafetyTimeout) {
      clearTimeout(this.prioritySafetyTimeout);
    }
    // Safety timeout to reset speaking state if onend is swallowed by browser
    this.prioritySafetyTimeout = setTimeout(() => {
      this.isSpeakingActive = false;
      this.currentPriority = null;
    }, 4500);

    const utterance = new SpeechSynthesisUtterance(text);
    this.activeUtterances.add(utterance); // Prevent V8 garbage collection of utterance

    const chosenVoice = this.getDedicatedFemaleEnglishVoice();
    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    } else {
      const fallbackVoices = this.getVoices();
      if (fallbackVoices && fallbackVoices.length > 0) {
        utterance.voice = fallbackVoices[0];
        utterance.lang = fallbackVoices[0].lang;
      }
    }

    // Apply strict configuration: configured voice speed (2.0x, 3.0x, or 4.0x), 1.0x pitch, 0.85 volume
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    utterance.onstart = () => {
      this.isSpeakingActive = true;
    };

    utterance.onend = () => {
      this.activeUtterances.delete(utterance);
      this.isSpeakingActive = false;
      this.currentPriority = null;
      if (this.prioritySafetyTimeout) {
        clearTimeout(this.prioritySafetyTimeout);
        this.prioritySafetyTimeout = null;
      }
    };

    utterance.onerror = (e) => {
      this.activeUtterances.delete(utterance);
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('Voice announcement error:', e.error);
      }
      this.isSpeakingActive = false;
      this.currentPriority = null;
      if (this.prioritySafetyTimeout) {
        clearTimeout(this.prioritySafetyTimeout);
        this.prioritySafetyTimeout = null;
      }
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {}
    };

    // Chromium cancel-then-speak fix: dispatch speak with micro-delay so cancel doesn't abort it
    setTimeout(() => {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speech synthesis speak failure:', err);
        this.activeUtterances.delete(utterance);
        this.isSpeakingActive = false;
        this.currentPriority = null;
      }
    }, 15);
  }

  // 1. Upcoming player & base price announcement
  public announceNomination(
    playerName: string,
    role?: string | null,
    lotId?: string,
    basePrice?: number,
  ) {
    if (!this.enabled || !playerName) return;

    // Reset countdown sequence whenever a player is nominated
    this.currentDeadlineGeneration++;
    this.stopCountdown();

    const dedupKey = lotId || playerName;
    if (lotId && this.announcedNominationLots.has(lotId)) {
      return;
    }
    this.announcedNominationLots.add(dedupKey);

    const cleanRole = mapPlayerRole(role || undefined);
    const formattedPrice = formatRupeesSpoken(basePrice || 2000000);
    const rolePart = cleanRole ? `, ${cleanRole}` : '';
    const text = `Next player: ${playerName}${rolePart}. Base price: ${formattedPrice}.`;

    this.speak(text, 'NOMINATION');
  }

  // 2. Newly accepted bid announcement with franchise and amount
  public announceBid(teamName: string, amount: number, isStarting: boolean = false, lotId?: string) {
    if (!this.enabled || !amount) return;

    // Valid bid resets countdown deadline: invalidate and cancel old countdown immediately
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

  // 3. Countdown: Strictly 3 down to 1 (not 5 to 0), announce each number without skipping
  public announceCountdown(seconds: number, lotId?: string, _speedMultiplier: number = 1.0) {
    void _speedMultiplier;
    if (!this.enabled || !this.countdownEnabled) return;
    if (seconds < 1 || seconds > 3) return; // Strictly 3 to 1

    // Confirmed sale results take precedence over countdown
    if (this.currentPriority === 'RESULT') {
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

    // Drop stale higher ticks
    if (this.lastAnnouncedCountdownNumber !== null && seconds > this.lastAnnouncedCountdownNumber) {
      return;
    }

    const spokenText = this.getCountdownSpokenText(seconds);
    if (!spokenText) return;

    this.lastAnnouncedCountdownNumber = seconds;

    // Direct dispatch speaks every countdown number (3, 2, 1) on time
    this.speak(spokenText, 'COUNTDOWN');
  }

  // 4. Confirmed SOLD announcement
  public announceSale(playerName: string, winningTeamName: string, price: number, lotId?: string) {
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

  // 5. Confirmed UNSOLD announcement
  public announceUnsold(playerName: string, lotId?: string) {
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

  // 6. Test Voice Announcement Button handler - speaks with highest priority so it always sounds
  public testVoice(): void {
    this.unlockAudio();
    const sampleText = 'Next player: Virat Kohli. Base price: 2 Crore. Royal Challengers Bengaluru bids 2 Crore 20 Lakh.';
    this.speak(sampleText, 'RESULT');
  }
}

export const auctioneerVoice = new AuctioneerVoiceService();
