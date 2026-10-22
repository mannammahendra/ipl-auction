'use client';

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { useAuctionStore } from '../lib/store';
import { formatRupees } from '../lib/formatters';
import { Gavel, X, Sparkles, AlertCircle } from 'lucide-react';
import TeamLogo from './TeamLogo';
import { PlayerPortrait } from './PlayerPortrait';

export function SoldCelebrationModal() {
  const { soldCelebration, unsoldNotice, dismissCelebration, currentAuctionPlayer } = useAuctionStore();
  const [visible, setVisible] = useState(false);
  const [soldImgError, setSoldImgError] = useState(false);
  const [unsoldImgError, setUnsoldImgError] = useState(false);

  // Auto-dismiss celebration immediately when a new player is nominated
  useEffect(() => {
    if (currentAuctionPlayer && currentAuctionPlayer.status !== 'SOLD' && currentAuctionPlayer.status !== 'UNSOLD') {
      dismissCelebration();
      setVisible(false);
    }
  }, [currentAuctionPlayer?.id, currentAuctionPlayer?.status, dismissCelebration]);

  useEffect(() => {
    setSoldImgError(false);
    setUnsoldImgError(false);

    if (soldCelebration) {
      setVisible(true);

      // Fire confetti burst
      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
          colors: [
            soldCelebration.team.color || '#f59e0b',
            '#e11d48',
            '#3b82f6',
            '#10b981',
            '#fbbf24',
          ],
        });
      } catch {
        // Ignore confetti failure in test or headless environments
      }

      const timer = setTimeout(() => {
        dismissCelebration();
        setVisible(false);
      }, 1100);

      return () => clearTimeout(timer);
    } else if (unsoldNotice) {
      setVisible(true);
      const timer = setTimeout(() => {
        dismissCelebration();
        setVisible(false);
      }, 550);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [soldCelebration, unsoldNotice, dismissCelebration]);

  if (!visible || (!soldCelebration && !unsoldNotice)) {
    return null;
  }

  // 1. UNSOLD MODAL DISPLAY (With Player Picture)
  if (unsoldNotice) {
    const { player } = unsoldNotice;
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      player.name
    )}&background=1e293b&color=94a3b8&size=256&bold=true`;

    return (
      <div
        onClick={() => {
          dismissCelebration();
          setVisible(false);
        }}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-fadeIn cursor-pointer"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-2xl text-center overflow-hidden cursor-default"
        >
          {/* Close button */}
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={() => {
                dismissCelebration();
                setVisible(false);
              }}
              className="p-1 rounded-full bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Unsold Header Pill */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mb-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[11px] font-black tracking-widest uppercase">
              <AlertCircle className="w-3 h-3" />
              <span>BIDDING CONCLUDED</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-slate-700/60 text-slate-300 text-[10px] font-bold">
              <span>🔨 Gavel Sealed &bull; Unsold</span>
            </div>
          </div>

          {/* Prominent Player Picture with Unsold Stamp: Head to Waist view */}
          <div className="relative w-28 h-36 sm:w-32 sm:h-40 mx-auto mb-2.5">
            <PlayerPortrait
              key={`unsold_${player.id || player.name}`}
              player={player}
              className="w-full h-full"
              imageClassName="grayscale contrast-125"
            />

            {/* Red UNSOLD Stamp Badge */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-rose-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded shadow-lg tracking-wider border border-rose-400 uppercase rotate-[-3deg] z-10">
              UNSOLD
            </div>
          </div>

          <h2 className="text-base sm:text-lg font-black text-white tracking-tight mb-0.5">
            {player.name}
          </h2>
          <p className="text-[11px] font-semibold text-slate-400 mb-2.5">
            {player.role.replace('_', ' ')} &bull; {player.country}
          </p>

          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 mb-3 flex items-center justify-around">
            <div>
              <span className="text-[9px] uppercase font-bold text-slate-500 block">Base Price</span>
              <span className="text-xs font-bold text-slate-300 font-mono">
                {formatRupees(player.basePrice)}
              </span>
            </div>
            <div className="h-5 w-px bg-slate-800" />
            <div>
              <span className="text-[9px] uppercase font-bold text-rose-400/80 block">Status</span>
              <span className="text-[11px] font-black text-rose-400 uppercase">
                Eligible for Recall
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              dismissCelebration();
              setVisible(false);
            }}
            className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all active:scale-98"
          >
            Acknowledge & Continue
          </button>
        </div>
      </div>
    );
  }

  // 2. SOLD MODAL DISPLAY (With Prominent Player Picture & Winning Franchise)
  if (soldCelebration) {
    const { player, team, amount } = soldCelebration;
    const teamAccentColor = team.color || '#f59e0b';
    const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      player.name
    )}&background=1e293b&color=f59e0b&size=256&bold=true`;

    return (
      <div
        onClick={() => {
          dismissCelebration();
          setVisible(false);
        }}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fadeIn cursor-pointer"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm sm:max-w-md bg-slate-900 border-2 rounded-2xl p-4 sm:p-5 shadow-2xl text-center overflow-hidden cursor-default"
          style={{ borderColor: `${teamAccentColor}88` }}
        >
          {/* Subtle background glow matching team color */}
          <div
            className="absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-25 pointer-events-none"
            style={{ backgroundColor: teamAccentColor }}
          />
          <div
            className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-25 pointer-events-none"
            style={{ backgroundColor: teamAccentColor }}
          />

          {/* Close button */}
          <div className="absolute top-3 right-3 z-10">
            <button
              onClick={() => {
                dismissCelebration();
                setVisible(false);
              }}
              className="p-1 rounded-full bg-slate-800/80 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Hammer drop title */}
          <div className="flex flex-col items-center justify-center gap-1.5 mb-2">
            <div
              className="py-0.5 px-3 rounded-lg text-white shadow-lg flex items-center gap-1.5 text-[11px] font-black tracking-widest uppercase"
              style={{ backgroundColor: teamAccentColor }}
            >
              <Gavel className="w-3 h-3 text-white" />
              <span>HAMMER BROKEN &bull; SOLD!</span>
            </div>
          </div>

          {/* Prominent Player Picture in Franchise Frame: Head to Waist view */}
          <div className="relative w-32 h-40 sm:w-40 sm:h-48 mx-auto mb-2.5">
            <PlayerPortrait
              key={`sold_${player.id || player.name}`}
              player={player}
              className="w-full h-full border-2"
            />

            {/* Team Logo Badge on Player Photo */}
            <div
              className="absolute -bottom-2 -right-2 rounded-lg shadow-xl border-2 border-slate-900 overflow-hidden bg-slate-900 z-10"
              title={team.name}
            >
              <TeamLogo logo={team.logo} name={team.name} shortName={team.shortName} size="xs" />
            </div>
          </div>

          {/* Player Name & Role */}
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight mb-0.5">
            {player.name}
          </h2>
          <p className="text-[11px] font-bold text-amber-400/90 mb-2.5">
            {player.role.replace('_', ' ')} &bull; {player.country}
          </p>

          {/* Winning Franchise & Hammer Price Card */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 mb-3">
            <div className="flex items-center justify-between gap-2.5 pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2 text-left">
                <TeamLogo logo={team.logo} name={team.name} shortName={team.shortName} size="xs" />
                <div>
                  <span className="text-[9px] font-bold text-slate-500 uppercase block">Acquired by</span>
                  <span className="text-xs font-black text-white">{team.name}</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Base Price</span>
                <span className="text-xs font-semibold text-slate-300 font-mono">
                  {formatRupees(player.basePrice)}
                </span>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                Winning Hammer Price
              </span>
              <span className="text-lg sm:text-xl font-black text-emerald-400 font-mono">
                {formatRupees(amount)}
              </span>
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={() => {
              dismissCelebration();
              setVisible(false);
            }}
            className="w-full py-1.5 px-4 rounded-lg text-white font-bold text-xs tracking-wider shadow-md transition-transform active:scale-[0.98] hover:brightness-110 flex items-center justify-center gap-1.5"
            style={{ backgroundColor: teamAccentColor }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>CONTINUE LIVE AUCTION</span>
          </button>
        </div>
      </div>
    );
  }

  return null;
}
