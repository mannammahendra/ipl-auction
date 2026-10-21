'use client';

import React, { useState, useEffect } from 'react';
import { useAuctionStore } from '../lib/store';
import { socketService } from '../lib/socket';
import { formatRupees, formatTime } from '../lib/formatters';
import TeamLogo from './TeamLogo';
import { Timer } from 'lucide-react';
import { PlayerPortrait } from './PlayerPortrait';
import { calculateNextValidBid } from '../lib/auctionRules';

export const FloatingAuctionBar: React.FC = React.memo(function FloatingAuctionBar() {
  const {
    room,
    currentAuctionPlayer,
    currentBidAmount,
    currentBidTeam,
    currentBidTeamId,
    remainingTimer,
    isTimerPaused,
    user,
  } = useAuctionStore();

  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const [biddingLoading, setBiddingLoading] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Trigger floating pop-up when scrolled past ~260px (top section begins scrolling away)
      setIsScrolledDown(window.scrollY > 260);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!room || !currentAuctionPlayer || room.status === 'COMPLETED') {
    return null;
  }

  const { player } = currentAuctionPlayer;
  const myMember = room.members?.find((m) => m.userId === user?.id);
  const myTeam = room.teams?.find((t) => t.id === myMember?.teamId);

  // Compute next bid amount using shared auction rules
  const { nextBid } = calculateNextValidBid(currentBidAmount || 0, player.basePrice);

  // Check bid eligibility
  const isEligible =
    Boolean(myTeam) &&
    !room.isPaused &&
    !isTimerPaused &&
    currentBidTeamId !== myTeam?.id &&
    myTeam!.currentPurse >= nextBid &&
    myTeam!.totalPlayers < room.maxSquad &&
    (!player.isOverseas || myTeam!.overseasCount < room.maxOverseas);

  const isLeadingBidder = Boolean(myTeam && currentBidTeamId === myTeam.id);

  const handlePlaceBid = async () => {
    if (!isEligible || !myTeam || biddingLoading) return;

    setBiddingLoading(true);
    socketService.placeBid(room.id, myTeam.id, nextBid);

    setTimeout(() => {
      setBiddingLoading(false);
    }, 400);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <aside 
      aria-label="Live Auction Sticky HUD"
      className={`fixed top-11 sm:top-12 left-0 right-0 z-30 px-2 sm:px-4 pointer-events-none transition-all duration-300 ease-out transform ${
        isScrolledDown
          ? 'translate-y-0 opacity-100 scale-100'
          : '-translate-y-12 opacity-0 scale-95'
      }`}
    >
      <div className="max-w-7xl mx-auto pointer-events-auto bg-slate-950/95 border border-amber-500/50 shadow-[0_12px_40px_-5px_rgba(0,0,0,0.85),0_0_24px_rgba(245,158,11,0.25)] backdrop-blur-xl rounded-2xl p-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2.5 sm:gap-4 ring-1 ring-white/10">
        
        {/* =========================================
            LEFT SIDE: Player Picture & Info
            ========================================= */}
        <div
          onClick={scrollToTop}
          className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group min-w-0"
          title="Click to scroll back to player profile"
        >
          {/* Player Picture thumbnail */}
          <div className="relative group-hover:scale-105 transition-all shrink-0">
            <PlayerPortrait
              key={player.id || player.name}
              player={player}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl shadow-sm"
            />
            {player.isOverseas && (
              <span
                className="absolute bottom-0 right-0 text-[8px] bg-slate-950/90 rounded-full px-1 border border-sky-400/40 z-10"
                title="Overseas Player"
              >
                ✈️
              </span>
            )}
          </div>

          {/* Player Details */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-black text-xs sm:text-sm text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)] transition-colors truncate">
                {player.name}
              </span>
              <span className="text-[10px] text-amber-500/80 font-mono hidden sm:inline">
                #{currentAuctionPlayer.lotNumber}
              </span>
            </div>
          </div>
        </div>

        {/* =========================================
            RIGHT SIDE: Live Auction Bid & Controls
            ========================================= */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          
          {/* Bid Amount & Leading Team */}
          <div className="flex items-center gap-1.5">
            <span className="font-black text-sm sm:text-base text-amber-400 font-mono tracking-tight drop-shadow-sm">
              {formatRupees(currentBidAmount > 0 ? currentBidAmount : player.basePrice)}
            </span>

            {/* Leading Team Logo & Badge */}
            {currentBidTeam && (
              <div
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-black shadow-sm"
                style={{
                  backgroundColor: `${currentBidTeam.color}20`,
                  borderColor: `${currentBidTeam.color}60`,
                  color: currentBidTeam.color,
                }}
                title={`Highest bidder: ${currentBidTeam.name}`}
              >
                <TeamLogo
                  logo={currentBidTeam.logo}
                  name={currentBidTeam.name}
                  shortName={currentBidTeam.shortName}
                  size="xs"
                />
                <span>{currentBidTeam.shortName}</span>
              </div>
            )}
          </div>

          {/* Live Countdown Timer */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-xl border text-xs font-mono font-bold transition-all shadow-sm ${
              remainingTimer <= 3
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/60 ring-2 ring-rose-500/40 animate-pulse'
                : remainingTimer <= 6
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
            }`}
          >
            <Timer className="w-3 h-3 shrink-0" />
            <span>{formatTime(remainingTimer)}</span>
          </div>

          {/* Direct Quick Bid Button */}
          {isLeadingBidder ? (
            <div className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black shadow-md flex items-center gap-1 whitespace-nowrap">
              <span>Winning</span>
              <span className="hidden sm:inline">Bid</span>
            </div>
          ) : !myTeam ? (
            <div className="px-2 py-1 rounded-xl bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold whitespace-nowrap hidden sm:block">
              Spectating
            </div>
          ) : (
            <button
              onClick={handlePlaceBid}
              disabled={!isEligible || biddingLoading}
              className={`flex items-center justify-center px-3.5 sm:px-4 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg transition-all active:scale-95 whitespace-nowrap ${
                isEligible
                  ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 hover:shadow-amber-500/30'
                  : 'bg-slate-800/80 text-slate-500 border border-slate-700/80 cursor-not-allowed opacity-60'
              }`}
            >
              <span>{formatRupees(nextBid)}</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
});


