// Cricket Auction Voice Announcement Engine
// Professional, energetic female Indian English auctioneer commentary
// Fast 2.0x default commentary pace completely independent of auction countdown / blitz speed

export type SpeechPriority = 'INFO' | 'COUNTDOWN' | 'NOMINATION' | 'BID' | 'RESULT';

export const PRIORITY_ORDER: Record<SpeechPriority, number> = {
  INFO: 1,
  COUNTDOWN: 2,
  NOMINATION: 3,
  BID: 4,
  RESULT: 5,
};

export interface VoiceSettings {
  enabled: boolean;
  rate: number; // Normal voice speed, default 2.0x
  pitch: number; // Voice pitch, default 1.0x
  volume: number; // Voice volume, default 0.85 (85%)
  voiceURI: string | null;
  countdownEnabled: boolean;
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
  private rate: number = 2.0; // Strictly 2.0x default voice playback rate
  private pitch: number = 1.0; // 1.0x normal pitch
  private volume: number = 0.85; // 85% volume
  private countdownEnabled: boolean = true;
  private selectedVoiceURI: string | null = null;
  private allVoices: SpeechSynthesisVoice[] = [];
  private activeUtterances = new Set<SpeechSynthesisUtterance>(); // Prevents V8 garbage collection!
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
          const parsedRate = parseFloat(savedRate);
          this.rate = !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : 2.0;
        } else {
          this.rate = 2.0;
        }

        const savedPitch = localStorage.getItem('ipl_voice_pitch');
        if (savedPitch) {
          const parsedPitch = parseFloat(savedPitch);
          this.pitch = !isNaN(parsedPitch) && parsedPitch > 0 ? parsedPitch : 1.0;
        } else {
          this.pitch = 1.0;
        }

        const savedVolume = localStorage.getItem('ipl_voice_volume');
        if (savedVolume) {
          const parsedVol = parseFloat(savedVolume);
          this.volume = !isNaN(parsedVol) && parsedVol >= 0 && parsedVol <= 1 ? parsedVol : 0.85;
        } else {
          this.volume = 0.85;
        }

        const savedCountdown = localStorage.getItem('ipl_voice_countdown_enabled');
        if (savedCountdown !== null) {
          this.countdownEnabled = savedCountdown === 'true';
        }

        this.selectedVoiceURI = localStorage.getItem('ipl_voice_uri');
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

  // Select the best available female Indian English voice, or closest supported English female voice
  public getBestIndianFemaleVoice(): SpeechSynthesisVoice | null {
    const voices = this.getVoices();
    if (!voices || voices.length === 0) return null;

    if (this.selectedVoiceURI) {
      const explicit = voices.find((v) => v.voiceURI === this.selectedVoiceURI);
      if (explicit) return explicit;
    }

    const femaleKeywords = [
      'female', 'woman', 'girl', 'heera', 'kavya', 'veena', 'neerja', 'aditi',
      'kalpana', 'priya', 'ananya', 'zira', 'samantha', 'victoria', 'sonia', 'serena',
    ];

    let bestVoice: SpeechSynthesisVoice | null = null;
    let highestScore = -1;

    for (const v of voices) {
      const lang = (v.lang || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      let score = 0;

      const isIndianLang = lang.includes('en-in') || lang.includes('hi-in') || lang.includes('en_in');
      const isEnglish = lang.startsWith('en');
      const isFemale = femaleKeywords.some((kw) => name.includes(kw));
      const hasIndianName = name.includes('india') || name.includes('hindi') || name.includes('heera') || name.includes('kavya') || name.includes('veena') || name.includes('neerja');

      if (isIndianLang && isFemale) score += 150;
      else if (isIndianLang) score += 100;
      else if (hasIndianName) score += 80;
      else if (isEnglish && isFemale) score += 50;
      else if (isEnglish) score += 20;

      if (name.includes('natural') || name.includes('online') || name.includes('google') || name.includes('microsoft')) {
        score += 10;
      }

      if (score > highestScore) {
        highestScore = score;
        bestVoice = v;
      }
    }

    return bestVoice || voices[0] || null;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_enabled', String(val));
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
    const cleanRate = Math.min(4.0, Math.max(0.5, rate || 2.0));
    this.rate = cleanRate;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_rate', String(cleanRate));
    }
  }

  public getPitch(): number {
    return this.pitch;
  }

  public setPitch(pitch: number) {
    const cleanPitch = Math.min(2.0, Math.max(0.5, pitch || 1.0));
    this.pitch = cleanPitch;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_pitch', String(cleanPitch));
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(volume: number) {
    const cleanVolume = Math.min(1.0, Math.max(0.0, volume ?? 0.85));
    this.volume = cleanVolume;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_volume', String(cleanVolume));
    }
  }

  public isCountdownEnabled(): boolean {
    return this.countdownEnabled;
  }

  public setCountdownEnabled(enabled: boolean) {
    this.countdownEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_countdown_enabled', String(enabled));
      if (!enabled && this.currentPriority === 'COUNTDOWN') {
        this.stopCountdown();
      }
    }
  }

  public getSelectedVoiceURI(): string | null {
    return this.selectedVoiceURI;
  }

  public setSelectedVoiceURI(uri: string | null) {
    this.selectedVoiceURI = uri;
    if (typeof window !== 'undefined') {
      if (uri) {
        localStorage.setItem('ipl_voice_uri', uri);
      } else {
        localStorage.removeItem('ipl_voice_uri');
      }
    }
  }

  public getVoiceName(): string {
    const voice = this.getBestIndianFemaleVoice();
    if (!voice) return 'Indian English Female (Default)';
    return voice.name;
  }

  public resetToDefaults() {
    this.enabled = true;
    this.rate = 2.0; // Required 3.0x default
    this.pitch = 1.0; // Required 1.0x pitch
    this.volume = 0.85; // Required 85% volume
    this.countdownEnabled = true;
    this.selectedVoiceURI = null;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ipl_voice_enabled', 'true');
      localStorage.setItem('ipl_voice_rate', '2.0');
      localStorage.setItem('ipl_voice_pitch', '1.0');
      localStorage.setItem('ipl_voice_volume', '0.85');
      localStorage.setItem('ipl_voice_countdown_enabled', 'true');
      localStorage.removeItem('ipl_voice_uri');
    }
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

  public onTimerTick(remainingSeconds: number) {
    if (remainingSeconds > 5) {
      this.resetCountdown();
    }
  }

  public getCountdownSpokenText(seconds: number): string | null {
    switch (seconds) {
      case 5:
        return 'Five';
      case 4:
        return 'Four';
      case 3:
        return 'Three';
      case 2:
        return 'Two';
      case 1:
        return 'One';
      case 0:
        return 'Zero';
      default:
        return null;
    }
  }

  public speak(text: string, priority: SpeechPriority = 'INFO'): void {
    if (!this.enabled || !text || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Always ensure synthesis is not paused
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {}

    const currentPrioNum = this.currentPriority ? PRIORITY_ORDER[this.currentPriority] : 0;
    const newPrioNum = PRIORITY_ORDER[priority];

    // If higher priority announcement is currently speaking, do not interrupt with lower priority
    // (Except RESULT which always has highest priority)
    if (this.isSpeakingActive && currentPrioNum > newPrioNum && priority !== 'RESULT') {
      return;
    }

    // High priority events (RESULT, BID, NOMINATION) interrupt lower priority speech
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

    const chosenVoice = this.getBestIndianFemaleVoice();
    if (chosenVoice) {
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang;
    } else {
      // Do not force en-IN when no en-IN voice is loaded, use available voice lang or navigator.language
      const fallbackVoices = this.getVoices();
      if (fallbackVoices && fallbackVoices.length > 0) {
        utterance.voice = fallbackVoices[0];
        utterance.lang = fallbackVoices[0].lang;
      }
    }

    // Apply strict configuration: 2.0x normal voice speed, 1.0x pitch, 0.85 volume
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

  // 3. Countdown: 5 down to 0, strictly at 2.0x speed, invalidated immediately on new bids
  public announceCountdown(seconds: number, lotId?: string, _speedMultiplier: number = 1.0) {
    void _speedMultiplier;
    if (!this.enabled || !this.countdownEnabled) return;
    if (seconds < 0 || seconds > 5) return;

    // Critical announcements take precedence: never interrupt nomination, bid, or sale result
    if (
      this.currentPriority === 'NOMINATION' ||
      this.currentPriority === 'BID' ||
      this.currentPriority === 'RESULT'
    ) {
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

    const capturedGeneration = this.currentDeadlineGeneration;
    // Microtask dispatch to allow any concurrent bid to take precedence
    setTimeout(() => {
      // If deadline generation changed in the interim (new bid arrived), abort stale countdown
      if (this.currentDeadlineGeneration !== capturedGeneration) {
        return;
      }
      this.speak(spokenText, 'COUNTDOWN');
    }, 10);
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
