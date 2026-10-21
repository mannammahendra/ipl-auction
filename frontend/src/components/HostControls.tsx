'use client';

import React, { useState } from 'react';
import { useAuctionStore } from '../lib/store';
import { socketService } from '../lib/socket';
import {
  Play,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';

export const HostControls = React.memo(function HostControls() {
  const user = useAuctionStore((s) => s.user);
  const room = useAuctionStore((s) => s.room);
  const isTimerPaused = useAuctionStore((s) => s.isTimerPaused);
  const currentAuctionPlayer = useAuctionStore((s) => s.currentAuctionPlayer);
  const speedMultiplier = useAuctionStore((s) => s.speedMultiplier);
  const setSpeedMultiplier = useAuctionStore((s) => s.setSpeedMultiplier);
  const setTimer = useAuctionStore((s) => s.setTimer);
  const chatOpen = useAuctionStore((s) => s.chatOpen);

  const [collapsed, setCollapsed] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isHost = Boolean(
    room &&
      user &&
      (room.hostId === user.id || room.members?.some((m) => m.userId === user.id && m.isHost))
  );

  // When chat drawer is open on mobile/desktop, hide host console so it NEVER overlaps the message input bar
  if (!isHost || !room || chatOpen) {
    return null;
  }

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleStart = () => {
    showFeedback('Starting Auction...');
    socketService.startAuction(room.id);
  };

  const handleNominateNext = () => {
    showFeedback('Nominated Next Player...');
    socketService.nominateNextPlayer(room.id);
  };

  const handlePause = () => {
    showFeedback('Pausing Auction...');
    // Optimistic pause for instantaneous mobile feedback
    setTimer(useAuctionStore.getState().remainingTimer, true);
    socketService.pauseAuction(room.id);
  };

  const handleResume = () => {
    showFeedback('Resuming Auction...');
    // Optimistic resume for instantaneous mobile feedback
    setTimer(useAuctionStore.getState().remainingTimer, false);
    socketService.resumeAuction(room.id);
  };

  const handleSkip = () => {
    showFeedback('Skipping Player...');
    socketService.skipPlayer(room.id);
  };

  const handleUndo = () => {
    showFeedback('Undoing Last Lot...');
    socketService.undoAction(room.id);
  };

  const handleBlitzClick = () => {
    // Cycle: 1x -> 1.25x -> 1.5x -> 1x (2x Blitz completely removed)
    const current = speedMultiplier || 1.0;
    let nextSpeed = 1.25;
    if (current < 1.1) {
      nextSpeed = 1.25;
    } else if (current < 1.35) {
      nextSpeed = 1.5;
    } else {
      nextSpeed = 1.0;
    }

    setSpeedMultiplier(nextSpeed);
    showFeedback(nextSpeed === 1.0 ? 'Speed: 1x Normal' : `Speed: ${nextSpeed}x Blitz!`);
    socketService.setAuctionSpeed(room.id, nextSpeed);
  };

  const handleEndAuction = () => {
    setIsEnding(true);
    showFeedback('Ending Auction...');
    socketService.endAuction(room.id);
    setTimeout(() => setIsEnding(false), 2000);
  };

  return (
    <>
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 pointer-events-auto select-none max-w-[95vw] transform-gpu will-change-transform">
        {collapsed ? (
          /* Vertically small collapsed button pill - strictly horizontal text without wrapping, snug padding */
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-slate-900/98 hover:bg-slate-800 border border-amber-500/70 hover:border-amber-400 rounded-full shadow-xl text-white cursor-pointer transition-transform active:scale-95 whitespace-nowrap shrink-0"
            title="Host Console"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 whitespace-nowrap">
              Host Console
            </span>
            <ChevronUp className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          </button>
        ) : (
          /* Vertically small expanded console: Host Console text on top, buttons horizontally below it */
          <div className="bg-slate-900/98 border border-amber-500/70 rounded-xl shadow-xl px-2.5 py-1 text-white flex flex-col items-center">
            {/* Header toggle bar */}
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="w-full flex items-center justify-between gap-3 py-0.5 px-1 rounded hover:bg-slate-800/80 transition-colors cursor-pointer text-left"
              title="Click to minimize Host Console"
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 whitespace-nowrap">
                  Host Console
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-300 hover:text-white shrink-0" />
            </button>

            {feedback && (
              <div className="text-[10px] font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40 animate-pulse my-0.5 whitespace-nowrap">
                {feedback}
              </div>
            )}

            {/* Buttons present below the host console text, touch-optimized for mobile and desktop */}
            <div className="flex flex-row items-center justify-center gap-1.5 pt-1 shrink-0 touch-manipulation">
              {room.status === 'LOBBY' ? (
                <button
                  onClick={handleStart}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white shadow-md transition-all active:scale-95 whitespace-nowrap touch-manipulation"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Auction</span>
                </button>
              ) : (
                <>
                  {!currentAuctionPlayer && room.status === 'AUCTION_ACTIVE' && (
                    <button
                      onClick={handleNominateNext}
                      className="flex items-center gap-1 px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white shadow-sm transition-all active:scale-95 whitespace-nowrap touch-manipulation"
                      title="Nominate next player from the upcoming pool"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Nominate Next</span>
                    </button>
                  )}

                  {isTimerPaused || room.isPaused ? (
                    <button
                      onClick={handleResume}
                      className="px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-xs text-white transition-all active:scale-95 whitespace-nowrap touch-manipulation shadow-sm"
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={handlePause}
                      className="px-3 py-1.5 min-h-[34px] rounded-lg bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white transition-all active:scale-95 whitespace-nowrap touch-manipulation shadow-sm"
                    >
                      Pause
                    </button>
                  )}

                  <button
                    onClick={handleSkip}
                    className="px-2.5 py-1.5 min-h-[34px] rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 font-bold text-xs text-slate-200 transition-all active:scale-95 whitespace-nowrap touch-manipulation"
                  >
                    Skip
                  </button>

                  <button
                    onClick={handleUndo}
                    title="Undo last hammer strike and refund purse"
                    className="px-2.5 py-1.5 min-h-[34px] rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/60 font-bold text-xs text-indigo-300 transition-all active:scale-95 whitespace-nowrap touch-manipulation"
                  >
                    Undo
                  </button>

                  <button
                    onClick={handleBlitzClick}
                    title={`Blitz Speed: Currently ${speedMultiplier || 1}x. Click to change speed (1.25x -> 1.5x -> 1x)`}
                    className={`flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg font-bold text-xs transition-all active:scale-95 whitespace-nowrap touch-manipulation ${
                      (speedMultiplier || 1) > 1
                        ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30 ring-1 ring-amber-300'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300'
                    }`}
                  >
                    <Zap className={`w-3.5 h-3.5 ${(speedMultiplier || 1) > 1 ? 'text-slate-950 fill-slate-950' : 'text-amber-400'}`} />
                    <span>Blitz{(speedMultiplier && speedMultiplier > 1) ? ` ${speedMultiplier}x` : ''}</span>
                  </button>

                  {/* Accelerated Blitz Round trigger when unsold players exist and no active player is currently bidding */}
                  {(room.auctionPlayers?.filter((ap) => ap.status === 'UNSOLD').length || 0) > 0 && !currentAuctionPlayer && (
                    <button
                      onClick={() => {
                        const unsold = room.auctionPlayers?.filter((ap) => ap.status === 'UNSOLD').length || 0;
                        showFeedback(`Starting Accelerated Round (${unsold} players)...`);
                        socketService.startAcceleratedRound(room.id, 15);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg bg-orange-600 hover:bg-orange-500 font-bold text-xs text-white shadow-sm transition-all active:scale-95 whitespace-nowrap touch-manipulation"
                      title={`Trigger Accelerated Blitz Round for ${room.auctionPlayers?.filter((ap) => ap.status === 'UNSOLD').length || 0} unsold players`}
                    >
                      <Zap className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
                      <span>Accelerate ({room.auctionPlayers?.filter((ap) => ap.status === 'UNSOLD').length || 0})</span>
                    </button>
                  )}

                  <button
                    onClick={handleEndAuction}
                    disabled={isEnding}
                    title="Stop the entire auction and lock all squads"
                    className="px-3 py-1.5 min-h-[34px] rounded-lg bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 font-bold text-xs text-white shadow-sm transition-all active:scale-95 whitespace-nowrap disabled:opacity-50 touch-manipulation"
                  >
                    {isEnding ? 'Ending...' : 'End'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
});
