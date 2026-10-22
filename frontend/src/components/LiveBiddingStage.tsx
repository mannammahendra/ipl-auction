'use client';

import React, { useState, useEffect } from 'react';
import { useAuctionStore } from '../lib/store';
import { socketService } from '../lib/socket';
import { api } from '../lib/api';
import { formatRupees, formatTime } from '../lib/formatters';
import { Gavel, Timer, AlertCircle, TrendingUp, Lock, Zap } from 'lucide-react';
import TeamLogo from './TeamLogo';
import { calculateMaxSafeBid, formatRupeesCompact } from './PurseRadarModal';
import { getPlayerBasePriceList } from '../lib/playerPhotos';
import { calculateNextValidBid } from '../lib/auctionRules';

export function LiveBiddingStage() {
  const {
    user,
    room,
    setRoom,
    currentAuctionPlayer,
    currentBidAmount,
    currentBidTeam,
    currentBidTeamId,
    currentBidderName,
    remainingTimer,
    isTimerPaused,
    isAccelerated,
    speedMultiplier,
  } = useAuctionStore();

  const [customBidInput, setCustomBidInput] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!room || !currentAuctionPlayer || currentAuctionPlayer.status === 'SOLD' || currentAuctionPlayer.status === 'UNSOLD') {
    return null;
  }

  const { player } = currentAuctionPlayer;
  const myMember = room.members?.find((m) => m.userId === user?.id);
  const myTeam = room.teams?.find((t) => t.id === myMember?.teamId);

  // Franchises available to be claimed (exclusive - claimed teams cannot be chosen by anyone else)
  const availableTeams = room.teams?.filter((t) => {
    const takenByOther = room.members?.some((m) => m.teamId === t.id && m.userId !== user?.id);
    return !takenByOther;
  }) || [];

  const handleClaimTeam = async (teamId: string) => {
    try {
      setIsSubmitting(true);
      const updatedRoom = await api.rooms.selectTeam(room.id, teamId);
      setRoom(updatedRoom);
      setLocalError(null);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to claim franchise');
      setTimeout(() => setLocalError(null), 3500);
    } finally {
      setIsSubmitting(false);
    }
  };

  const { nextBid, increment } = calculateNextValidBid(currentBidAmount || 0, player.basePrice);

  const getBidEligibility = (targetBid: number): { allowed: boolean; reason?: string } => {
    if (room.isPaused || isTimerPaused) {
      return { allowed: false, reason: 'Auction is paused' };
    }

    const effectiveTeam = myTeam || availableTeams[0];

    if (!effectiveTeam) {
      return { allowed: false, reason: 'No franchise available to bid' };
    }

    if (myTeam && currentBidTeamId === myTeam.id) {
      return { allowed: false, reason: 'You hold the current highest bid!' };
    }

    if (targetBid > effectiveTeam.currentPurse) {
      return { allowed: false, reason: `Purse too low: only ${formatRupees(effectiveTeam.currentPurse)} left` };
    }

    if (effectiveTeam.totalPlayers >= room.maxSquad) {
      return { allowed: false, reason: `Squad complete (${effectiveTeam.totalPlayers}/${room.maxSquad} players acquired)` };
    }

    if (player.isOverseas && effectiveTeam.overseasCount >= room.maxOverseas) {
      return {
        allowed: false,
        reason: `Overseas quota full (${effectiveTeam.overseasCount}/${room.maxOverseas} OS)`,
      };
    }

    const currentSquad = effectiveTeam.squad?.length || effectiveTeam.totalPlayers || 0;
    const remainingSlotsToMin = Math.max(0, room.minSquad - (currentSquad + 1));
    const minReservePerSlot = Math.min(2000000, Math.max(500000, Math.floor(room.startingPurse / (room.maxSquad * 2))));
    const requiredReserve = remainingSlotsToMin * minReservePerSlot;
    if (effectiveTeam.currentPurse - targetBid < requiredReserve) {
      return {
        allowed: false,
        reason: `Compulsory reserve: Need ${formatRupees(requiredReserve)} for ${remainingSlotsToMin} mandatory slots`,
      };
    }

    return { allowed: true };
  };

  const handlePlaceBid = async (amount?: number) => {
    let effectiveTeam = myTeam;

    // If user has not chosen a franchise yet, auto-claim the first available franchise!
    if (!effectiveTeam) {
      if (availableTeams.length > 0) {
        try {
          setIsSubmitting(true);
          const firstAvailable = availableTeams[0];
          const updatedRoom = await api.rooms.selectTeam(room.id, firstAvailable.id);
          setRoom(updatedRoom);
          effectiveTeam = updatedRoom.teams?.find((t: any) => t.id === firstAvailable.id);
        } catch (err: any) {
          setLocalError('Please claim a franchise to place bids');
          setTimeout(() => setLocalError(null), 3000);
          setIsSubmitting(false);
          return;
        }
      } else {
        setLocalError('All franchises are currently claimed');
        setTimeout(() => setLocalError(null), 3000);
        return;
      }
    }

    if (!effectiveTeam) {
      setLocalError('You must select a team to bid');
      setTimeout(() => setLocalError(null), 3000);
      return;
    }

    const check = getBidEligibility(amount || nextBid);
    if (!check.allowed) {
      setLocalError(check.reason || 'Invalid bid');
      setTimeout(() => setLocalError(null), 3000);
      return;
    }

    const targetBid = amount || nextBid;
    setLocalError(null);
    setIsSubmitting(true);

    // Instant optimistic update (0ms latency, fast as Flash!)
    useAuctionStore.setState({
      currentBidAmount: targetBid,
      currentBidTeamId: effectiveTeam.id,
      currentBidTeam: effectiveTeam,
      currentBidderName: user?.username || 'You',
      remainingTimer: room.bidTimerSeconds || 14,
    });

    socketService.placeBid(room.id, effectiveTeam.id, amount);
    setTimeout(() => setIsSubmitting(false), 50);
  };

  const handleCustomBid = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(customBidInput);
    if (isNaN(parsed) || parsed <= 0) {
      setLocalError('Enter a valid bid amount in Crores (e.g. 5.5)');
      return;
    }
    const amountInRupees = Math.round(parsed * 10000000);
    handlePlaceBid(amountInRupees);
    setCustomBidInput('');
  };

  const standardEligibility = getBidEligibility(nextBid);

  const getTimerColorClass = () => {
    if (remainingTimer <= 3) return 'text-rose-400 border-rose-500 bg-rose-950/60 animate-countdown-pulse';
    if (remainingTimer <= 7) return 'text-amber-400 border-amber-500/80 bg-amber-950/40';
    return 'text-emerald-400 border-emerald-500/60 bg-emerald-950/30';
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xl backdrop-blur-xl relative overflow-hidden flex flex-col justify-between">
      {/* Dynamic franchise glow background */}
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-24 rounded-full opacity-20 blur-3xl pointer-events-none transition-colors duration-500"
        style={{ backgroundColor: currentBidTeam ? currentBidTeam.color : '#f59e0b' }}
      />

      <div className="relative z-10 flex flex-col">
        {/* Compact Header: Status & Live Clock */}
        <div className="flex items-center justify-between w-full mb-1.5 pb-1 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-extrabold tracking-wider text-slate-400">
              {currentBidAmount > 0 ? 'CURRENT BID' : 'OPENING BID'}
            </span>
            <span className={`text-[8.5px] font-black px-1.5 py-0.2 rounded border ${getPlayerBasePriceList(player.basePrice).badgeClass}`}>
              {getPlayerBasePriceList(player.basePrice).shortLabel}
            </span>
            {speedMultiplier && speedMultiplier > 1 && (
              <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 uppercase tracking-widest flex items-center gap-0.5 shadow-sm">
                <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                <span>{speedMultiplier}x SPEED</span>
              </span>
            )}
            {isAccelerated && (
              <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-400 border border-orange-500/50 uppercase tracking-widest flex items-center gap-0.5 animate-pulse">
                <Zap className="w-2.5 h-2.5 text-orange-400" />
                <span>BLITZ 15s</span>
              </span>
            )}
            {isTimerPaused && (
              <span className="text-[8px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-widest animate-pulse">
                PAUSED
              </span>
            )}
          </div>

          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border font-mono text-xs sm:text-sm font-black shadow-sm transition-all ${getTimerColorClass()}`}
          >
            <Timer className="w-3.5 h-3.5" />
            <span>{formatTime(remainingTimer)}</span>
          </div>
        </div>

        {/* Minimized Price Display & Leader */}
        <div className="text-center mb-1.5">
          <div className="text-lg sm:text-xl font-black tracking-tight text-white font-mono drop-shadow-sm leading-none">
            {currentBidAmount > 0 ? formatRupees(currentBidAmount) : formatRupees(player.basePrice)}
          </div>

          {currentBidTeam ? (
            <div
              className="mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-bold shadow-sm"
              style={{
                backgroundColor: `${currentBidTeam.color}15`,
                borderColor: `${currentBidTeam.color}50`,
                color: '#fff',
              }}
            >
              <TeamLogo logo={currentBidTeam.logo} name={currentBidTeam.name} shortName={currentBidTeam.shortName} size="xs" />
              <span className="font-extrabold flex items-center gap-1" style={{ color: currentBidTeam.color }}>
                <span>{currentBidderName ? currentBidderName : currentBidTeam.name}</span>
                <span className="font-mono text-[9px] font-black uppercase">
                  ({currentBidTeam.shortName})
                </span>
              </span>
            </div>
          ) : (
            <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-[9px] text-slate-400">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Awaiting opening bid</span>
            </div>
          )}
        </div>

        {localError && (
          <div className="w-full mb-1.5 p-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[10px] flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3 shrink-0 text-rose-400" />
            <span className="truncate">{localError}</span>
          </div>
        )}

        {/* If user has no franchise assigned, show one-tap franchise claiming selector */}
        {!myTeam && (
          <div className="mb-1.5 p-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[9.5px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <span>Claim Franchise to Bid:</span>
              </span>
              <span className="text-[8.5px] text-amber-300/70 font-mono">({availableTeams.length} available)</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {availableTeams.slice(0, 10).map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleClaimTeam(t.id)}
                  disabled={isSubmitting}
                  className="px-2 py-0.5 rounded text-[9.5px] font-black flex items-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-sm"
                  style={{
                    backgroundColor: `${t.color}25`,
                    color: t.color,
                    border: `1px solid ${t.color}60`,
                  }}
                  title={`Claim ${t.name}`}
                >
                  <TeamLogo logo={t.logo} name={t.name} shortName={t.shortName} size="xs" />
                  <span>{t.shortName || t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact Bidding Actions */}
        <div className="space-y-1 w-full">
          <button
            onClick={() => handlePlaceBid()}
            disabled={!standardEligibility.allowed || isSubmitting}
            className={`w-full py-1.5 px-3 rounded-lg font-black text-xs sm:text-sm tracking-wide uppercase transition-all duration-150 flex items-center justify-center gap-1.5 shadow-md ${
              standardEligibility.allowed
                ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 hover:scale-[1.01] active:scale-[0.99] shadow-amber-500/25 ring-1 ring-amber-400/50'
                : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
            }`}
          >
            {standardEligibility.allowed ? (
              <>
                <Gavel className="w-3.5 h-3.5 text-slate-950" />
                <span>
                  {!myTeam && availableTeams[0]
                    ? `CLAIM ${availableTeams[0].shortName || 'FRANCHISE'} & BID ${formatRupees(nextBid)}`
                    : `BID ${formatRupees(nextBid)}`}
                </span>
                <span className="text-[9px] font-black px-1 py-0.2 rounded bg-slate-950/20 text-slate-950 font-mono">
                  (+{formatRupees(increment)})
                </span>
              </>
            ) : (
              <>
                <Lock className="w-3 h-3 text-slate-500" />
                <span className="text-[11px] normal-case font-bold truncate">{standardEligibility.reason}</span>
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => handlePlaceBid(nextBid + 2500000)}
              disabled={!getBidEligibility(nextBid + 2500000).allowed || isSubmitting}
              className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 text-[10px] font-bold text-slate-200 transition-colors flex items-center justify-center gap-1"
            >
              <TrendingUp className="w-3 h-3 text-amber-400" />
              <span>Jump +₹25 L</span>
            </button>

            <button
              onClick={() => handlePlaceBid(nextBid + 5000000)}
              disabled={!getBidEligibility(nextBid + 5000000).allowed || isSubmitting}
              className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 text-[10px] font-bold text-slate-200 transition-colors flex items-center justify-center gap-1"
            >
              <TrendingUp className="w-3 h-3 text-rose-400" />
              <span>Jump +₹50 L</span>
            </button>
          </div>

          <form onSubmit={handleCustomBid} className="flex gap-1 pt-0.5">
            <div className="relative flex-1">
              <input
                type="number"
                step="0.05"
                placeholder={`Custom bid (min ${(nextBid / 10000000).toFixed(2)})`}
                value={customBidInput}
                onChange={(e) => setCustomBidInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-0.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <span className="absolute right-2 top-0.5 text-[10px] text-slate-400 font-bold">Cr</span>
            </div>
            <button
              type="submit"
              disabled={!customBidInput}
              className="px-2.5 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 border border-slate-700 transition-colors"
            >
              Raise
            </button>
          </form>
        </div>

        {myTeam && (
          <div className="mt-1.5 text-[9px] text-slate-400 flex flex-col gap-0.5 border-t border-slate-800/80 pt-1 w-full">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1 truncate">
                <span>Franchise:</span>
                <span className="font-bold truncate" style={{ color: myTeam.color }}>
                  {myTeam.name}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span>Purse:</span>
                <span className="font-black text-amber-400 font-mono">
                  {formatRupees(myTeam.currentPurse)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[8.5px] text-slate-400 font-mono">
              <span className="text-slate-500 uppercase font-bold">Max Safe Bid:</span>
              <span className="font-black text-emerald-400">
                {formatRupeesCompact(
                  calculateMaxSafeBid(
                    myTeam.currentPurse,
                    myTeam.squad?.length || myTeam.totalPlayers || 0,
                    room?.minSquad || 18
                  )
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
