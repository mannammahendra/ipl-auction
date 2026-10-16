'use client';

import React from 'react';
import { AuctionPlayer } from '../lib/store';
import { formatRupees } from '../lib/formatters';
import { PlayerPortrait } from './PlayerPortrait';

interface PlayerProfileCardProps {
  auctionPlayer: AuctionPlayer | null;
}

export const PlayerProfileCard = React.memo(function PlayerProfileCard({ auctionPlayer }: PlayerProfileCardProps) {
  if (!auctionPlayer) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 flex flex-col items-center justify-center min-h-[120px] text-center shadow-xl backdrop-blur-xl">
        <div className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-1 text-lg animate-pulse">
          🏏
        </div>
        <h3 className="text-xs font-bold text-slate-300 mb-0.5">Auction Podium Empty</h3>
        <p className="text-[10px] text-slate-500 max-w-xs">
          Waiting for the auctioneer to nominate the next player to the stage...
        </p>
      </div>
    );
  }

  const { player } = auctionPlayer;
  const isMarquee = player.tier === 'MARQUEE';

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'BATSMAN':
        return { label: 'BATSMAN', icon: '🏏', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
      case 'BOWLER':
        return { label: 'BOWLER', icon: '⚡', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
      case 'ALL_ROUNDER':
        return { label: 'ALL-ROUNDER', icon: '⭐', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' };
      case 'WICKET_KEEPER':
        return { label: 'WICKET-KEEPER', icon: '🧤', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      default:
        return { label: role, icon: '🎯', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
    }
  };

  const roleBadge = getRoleBadge(player.role);
  const isOverseas = Boolean(
    player.isOverseas || (player.country && player.country.trim().toLowerCase() !== 'india')
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-800/80 shadow-slate-950/40 transition-all duration-300 shadow-xl bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 backdrop-blur-xl flex flex-col justify-between p-2.5 sm:p-3"
    >
      {/* Main Profile Info: Portrait + Name below, and on Right side: Role, Bat & Bowl types only */}
      <div className="flex items-center gap-3 sm:gap-3.5 mb-1.5">
        {/* Left Column: Portrait and Highlighted Name Below Picture */}
        <div className="flex flex-col items-center shrink-0 w-28 sm:w-32">
          <div className="relative">
            <PlayerPortrait
              key={player.id || player.name}
              player={player}
              className="w-28 h-36 sm:w-32 sm:h-40"
            />
            {isOverseas && (
              <span
                className="absolute top-1.5 right-1.5 bg-slate-950/90 text-white rounded-full p-1 border border-cyan-500/60 shadow-lg text-xs leading-none z-10 animate-pulse"
                title={`Overseas Player (${player.country})`}
              >
                ✈️
              </span>
            )}
          </div>

          {/* Player Name highlighted below the picture */}
          <div className="mt-1.5 w-full flex items-center justify-center">
            <div className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400/20 border border-amber-400/50 text-center shadow-[0_0_12px_rgba(251,191,36,0.3)] max-w-full">
              <h2 className="text-xs sm:text-sm font-black text-amber-300 tracking-tight leading-snug break-words drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                {player.name}
              </h2>
              {isOverseas && (
                <span
                  title={`Overseas Player (${player.country})`}
                  className="text-xs shrink-0 select-none animate-bounce"
                >
                  ✈️
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: ONLY display batsman/role, bat style, and bowl style */}
        <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1 pl-2 sm:pl-3 border-l border-slate-800/60">
          {/* Role badge */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div>
              <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 block mb-0.5">
                Role
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black border tracking-wider shadow-sm ${roleBadge.color}`}
              >
                <span>{roleBadge.icon}</span>
                <span>{roleBadge.label}</span>
              </span>
            </div>

            {/* Flight symbol badge for overseas player */}
            {isOverseas && (
              <div className="self-end pb-0.5">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold border bg-cyan-950/60 text-cyan-300 border-cyan-700/50 shadow-sm"
                  title={`Overseas Player (${player.country})`}
                >
                  <span>✈️</span>
                  <span>{player.country}</span>
                </span>
              </div>
            )}
          </div>

          {/* Batting style */}
          {player.battingStyle && (
            <div>
              <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 block">
                Batting Style
              </span>
              <p className="text-xs font-bold text-slate-200 flex items-center gap-1">
                <span className="text-slate-400">🏏</span>
                <span>{player.battingStyle}</span>
              </p>
            </div>
          )}

          {/* Bowling style */}
          {player.bowlingStyle && (
            <div>
              <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-slate-500 block">
                Bowling Style
              </span>
              <p className="text-xs font-bold text-slate-200 flex items-center gap-1">
                <span className="text-slate-400">⚡</span>
                <span>{player.bowlingStyle}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Base Price Tag - Vertically Small */}
      <div className="pt-1 mt-0.5 border-t border-slate-800/80 flex items-center justify-between">
        <span className="text-[8.5px] uppercase font-black tracking-wider text-slate-400">
          BASE PRICE
        </span>
        <span className="text-xs sm:text-sm font-black text-amber-400 font-mono leading-none">
          {formatRupees(player.basePrice)}
        </span>
      </div>
    </div>
  );
});
