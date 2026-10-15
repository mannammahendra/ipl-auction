'use client';

import React, { useState } from 'react';
import { useAuctionStore } from '../lib/store';
import { voiceChatManager } from '../lib/voiceChat';
import { Mic, MicOff, Volume2, Users, PhoneOff } from 'lucide-react';

interface MicrophoneControlProps {
  roomId: string;
}

export const MicrophoneControl: React.FC<MicrophoneControlProps> = ({ roomId }) => {
  const {
    isVoiceConnected,
    isMicMuted,
    isSpeaking,
    voiceParticipants,
    user,
  } = useAuctionStore();

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleMicClick = async () => {
    if (!isVoiceConnected) {
      setConnecting(true);
      await voiceChatManager.startVoice(roomId);
      setConnecting(false);
    } else {
      voiceChatManager.toggleMute();
    }
  };

  const handleDisconnect = () => {
    voiceChatManager.stopVoice();
    setPopoverOpen(false);
  };

  return (
    <div className="relative inline-block">
      <div className="flex items-center gap-1">
        {/* Main Mic Button */}
        <button
          onClick={handleMicClick}
          disabled={connecting}
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border transition-all active:scale-95 shrink-0 whitespace-nowrap shadow-sm ${
            !isVoiceConnected
              ? 'bg-slate-800/90 text-slate-300 hover:text-white border-slate-700 hover:border-slate-500'
              : isMicMuted
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/50 hover:bg-rose-500/25'
              : isSpeaking
              ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400 ring-2 ring-emerald-500/50 animate-pulse'
              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
          }`}
          title={
            !isVoiceConnected
              ? 'Click to enable microphone voice chat with room'
              : isMicMuted
              ? 'Microphone is muted (Click to speak)'
              : 'Microphone is LIVE (Click to mute)'
          }
        >
          {connecting ? (
            <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
          ) : !isVoiceConnected ? (
            <MicOff className="w-3 h-3 text-slate-400 shrink-0" />
          ) : isMicMuted ? (
            <MicOff className="w-3 h-3 text-rose-400 shrink-0" />
          ) : (
            <Mic className="w-3 h-3 text-emerald-400 shrink-0" />
          )}

          <span>
            {connecting
              ? 'Mic...'
              : !isVoiceConnected
              ? 'Mic'
              : isMicMuted
              ? 'Muted'
              : 'Live'}
          </span>

          {/* Sound wave bars when unmuted and speaking */}
          {isVoiceConnected && !isMicMuted && (
            <span className="flex items-center gap-0.5 ml-0.5">
              <span
                className={`w-0.5 rounded-full bg-emerald-400 transition-all ${
                  isSpeaking ? 'h-2.5 animate-bounce' : 'h-1 opacity-60'
                }`}
              />
              <span
                className={`w-0.5 rounded-full bg-emerald-400 transition-all ${
                  isSpeaking ? 'h-3.5 animate-bounce delay-75' : 'h-1.5 opacity-60'
                }`}
              />
              <span
                className={`w-0.5 rounded-full bg-emerald-400 transition-all ${
                  isSpeaking ? 'h-2 animate-bounce delay-150' : 'h-1 opacity-60'
                }`}
              />
            </span>
          )}
        </button>

        {/* Small dropdown arrow button to inspect voice peers when connected */}
        {isVoiceConnected && (
          <button
            onClick={() => setPopoverOpen(!popoverOpen)}
            className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[10px]"
            title="Voice participants & controls"
          >
            <Users className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* Voice Participants Popover */}
      {popoverOpen && isVoiceConnected && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-2xl p-2.5 z-50 backdrop-blur-xl animate-in fade-in slide-in-from-top-1 text-slate-200">
          <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-bold text-white">Voice Channel</span>
            </div>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/40 font-bold"
              title="Leave voice channel"
            >
              <PhoneOff className="w-2.5 h-2.5" />
              <span>Leave</span>
            </button>
          </div>

          <p className="text-[10px] text-slate-400 mb-1.5 font-semibold">Active in Voice:</p>
          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {/* Current user */}
            <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-800/60 text-xs">
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className={`w-2 h-2 rounded-full ${
                    !isMicMuted && isSpeaking
                      ? 'bg-emerald-400 ring-2 ring-emerald-400/50 animate-pulse'
                      : !isMicMuted
                      ? 'bg-emerald-500/70'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="font-bold text-[11px] truncate">{user?.username} (You)</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {isMicMuted ? 'Muted' : isSpeaking ? 'Speaking' : 'Open'}
              </span>
            </div>

            {/* Other peers */}
            {voiceParticipants
              .filter((p) => p.userId !== user?.id)
              .map((p) => (
                <div
                  key={p.socketId}
                  className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-800/40 text-xs"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        !p.isMuted && p.isSpeaking
                          ? 'bg-emerald-400 ring-2 ring-emerald-400/50 animate-pulse'
                          : !p.isMuted
                          ? 'bg-emerald-500/70'
                          : 'bg-rose-500'
                      }`}
                    />
                    <span className="font-bold text-[11px] truncate">
                      {p.username}
                      {p.teamShortName && (
                        <span className="ml-1 text-[9px] text-amber-400">({p.teamShortName})</span>
                      )}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {p.isMuted ? 'Muted' : p.isSpeaking ? 'Speaking' : 'Open'}
                  </span>
                </div>
              ))}

            {voiceParticipants.length <= 1 && (
              <p className="text-[10px] text-slate-500 text-center py-1">
                Waiting for others to turn on mic...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

