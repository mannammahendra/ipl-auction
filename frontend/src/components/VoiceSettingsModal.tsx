'use client';

import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, X, RotateCcw, Play, Settings2 } from 'lucide-react';
import { auctioneerVoice } from '../lib/voice';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged?: () => void;
}

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsChanged,
}) => {
  const [enabled, setEnabled] = useState(true);
  const [rate, setRate] = useState(2.0);
  const [pitch, setPitch] = useState(1.0);
  const [volume, setVolume] = useState(0.85);
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testPlaying, setTestPlaying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEnabled(auctioneerVoice.isEnabled());
      setRate(auctioneerVoice.getRate());
      setPitch(auctioneerVoice.getPitch());
      setVolume(auctioneerVoice.getVolume());
      setCountdownEnabled(auctioneerVoice.isCountdownEnabled());
      setSelectedVoiceURI(auctioneerVoice.getSelectedVoiceURI());

      const loadVoices = () => {
        const vList = auctioneerVoice.getVoices();
        setVoices(vList);
      };
      loadVoices();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleEnabled = () => {
    const next = !enabled;
    setEnabled(next);
    auctioneerVoice.setEnabled(next);
    onSettingsChanged?.();
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    auctioneerVoice.setRate(newRate);
    onSettingsChanged?.();
  };

  const handlePitchChange = (newPitch: number) => {
    setPitch(newPitch);
    auctioneerVoice.setPitch(newPitch);
    onSettingsChanged?.();
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    auctioneerVoice.setVolume(newVol);
    onSettingsChanged?.();
  };

  const handleCountdownToggle = () => {
    const next = !countdownEnabled;
    setCountdownEnabled(next);
    auctioneerVoice.setCountdownEnabled(next);
    onSettingsChanged?.();
  };

  const handleVoiceSelect = (uri: string) => {
    const val = uri === 'auto' ? null : uri;
    setSelectedVoiceURI(val);
    auctioneerVoice.setSelectedVoiceURI(val);
    onSettingsChanged?.();
  };

  const handleResetDefaults = () => {
    auctioneerVoice.resetToDefaults();
    setEnabled(true);
    setRate(2.0);
    setPitch(1.0);
    setVolume(0.85);
    setCountdownEnabled(true);
    setSelectedVoiceURI(null);
    onSettingsChanged?.();
  };

  const handleTestVoice = () => {
    setTestPlaying(true);
    auctioneerVoice.testVoice();
    setTimeout(() => {
      setTestPlaying(false);
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Auction Voice Settings
                <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Female Indian English
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Independent 2.0x commentary pace for players, bids & countdown
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-sm">
          {/* 1. Voice Enabled Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
            <div className="flex items-center gap-3">
              {enabled ? (
                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Volume2 className="w-4 h-4" />
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
                  <VolumeX className="w-4 h-4" />
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-200">Voice Commentary</p>
                <p className="text-xs text-slate-400">
                  {enabled ? 'Announcements are enabled' : 'Voice announcements are muted'}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggleEnabled}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 2. Voice Speed Slider (Default 2.0x) */}
          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200 flex items-center gap-2">
                Voice Playback Speed
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                  {rate.toFixed(1)}x
                </span>
                {rate === 2.0 && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    Standard 2x
                  </span>
                )}
              </label>
              <button
                onClick={() => handleRateChange(2.0)}
                className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium"
              >
                Set 2.0x Default
              </button>
            </div>
            <input
              type="range"
              min="0.5"
              max="4.0"
              step="0.1"
              value={rate}
              onChange={(e) => handleRateChange(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>0.5x</span>
              <span className="text-amber-400 font-bold">2.0x (Default)</span>
              <span>4.0x</span>
            </div>
            <p className="text-[11px] text-slate-400 italic">
              Notice: Voice speed remains independent of auction timer blitz speed.
            </p>
          </div>

          {/* 3. Volume & Pitch */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Volume */}
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Volume</label>
                <span className="text-[11px] font-mono font-bold text-amber-300">
                  {Math.round(volume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>0%</span>
                <span className="text-slate-400">85% Default</span>
                <span>100%</span>
              </div>
            </div>

            {/* Pitch */}
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">Pitch</label>
                <span className="text-[11px] font-mono font-bold text-amber-300">
                  {pitch.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.05"
                value={pitch}
                onChange={(e) => handlePitchChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>0.5x</span>
                <span className="text-slate-400">1.0x Normal</span>
                <span>1.5x</span>
              </div>
            </div>
          </div>

          {/* 4. Voice Selection Dropdown */}
          <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
            <label className="font-semibold text-slate-200 block text-xs">
              Speech Synthesis Voice
            </label>
            <select
              value={selectedVoiceURI || 'auto'}
              onChange={(e) => handleVoiceSelect(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="auto">
                🌟 Auto-Select Best Female Indian English Voice (Recommended)
              </option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              Active voice: <span className="text-slate-300 font-medium">{auctioneerVoice.getVoiceName()}</span>
            </p>
          </div>

          {/* 5. Countdown 5 to 0 Announcements */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div>
              <p className="font-semibold text-xs text-slate-200">5-to-0 Countdown Voice</p>
              <p className="text-[11px] text-slate-400">
                Speaks &quot;Five, Four, Three, Two, One, Zero&quot; synchronized with timer
              </p>
            </div>
            <button
              onClick={handleCountdownToggle}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                countdownEnabled ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  countdownEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer with Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/80 border-t border-slate-800 shrink-0">
          <button
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults (2.0x)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTestVoice}
              disabled={testPlaying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition active:scale-95 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{testPlaying ? 'Speaking...' : 'Test Voice'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition active:scale-95 shadow-md"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

