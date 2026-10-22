'use client';

import React, { useState } from 'react';
import { useAuctionStore } from '../lib/store';
import TeamLogo from './TeamLogo';
import {
  Radar,
  X,
  ShieldAlert,
  ShieldCheck,
  Info,
} from 'lucide-react';

interface PurseRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function calculateMaxSafeBid(
  currentPurse: number,
  currentSquadCount: number,
  minSquad: number = 18,
  minBasePrice: number = 2000000 // ₹20 Lakhs
): number {
  const remainingRequiredSlots = Math.max(0, minSquad - currentSquadCount);
  if (remainingRequiredSlots <= 1) {
    // If team only needs 1 or 0 players to meet minimum, they can spend entire purse!
    return currentPurse;
  }
  // Reserve min base price for all other required slots
  const reserveForOtherSlots = (remainingRequiredSlots - 1) * minBasePrice;
  return Math.max(0, currentPurse - reserveForOtherSlots);
}

export function formatRupeesCompact(amount: number): string {
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    const lk = amount / 100000;
    return `₹${lk % 1 === 0 ? lk.toFixed(0) : lk.toFixed(2)} L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export const PurseRadarModal: React.FC<PurseRadarModalProps> = ({ isOpen, onClose }) => {
  const { room, user } = useAuctionStore();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  if (!isOpen || !room) return null;

  const minSquad = room.minSquad || 18;
  const maxSquad = room.maxSquad || 25;
  const maxOverseas = room.maxOverseas || 8;
  const minBasePrice = 2000000; // 20 Lakhs

  const myMember = room.members?.find((m) => m.userId === user?.id);
  const myTeam = room.teams?.find((t) => t.id === myMember?.teamId);
  const myTeamId = myMember?.teamId;

  const selectedTeamIds = useMemo(() => {
    return new Set(
      (room.members || [])
        .map((m) => m.teamId)
        .filter((id): id is string => Boolean(id))
    );
  }, [room.members]);

  const sortedRoomTeams = useMemo(() => {
    return [...(room.teams || [])].sort((a, b) => {
      const aIsMyTeam = a.id === myTeamId;
      const bIsMyTeam = b.id === myTeamId;
      if (aIsMyTeam && !bIsMyTeam) return -1;
      if (!aIsMyTeam && bIsMyTeam) return 1;

      const aIsSelected = selectedTeamIds.has(a.id);
      const bIsSelected = selectedTeamIds.has(b.id);
      if (aIsSelected && !bIsSelected) return -1;
      if (!aIsSelected && bIsSelected) return 1;

      return b.currentPurse - a.currentPurse;
    });
  }, [room.teams, myTeamId, selectedTeamIds]);

  const activeTeamId = selectedTeamId || myTeam?.id || sortedRoomTeams[0]?.id;
  const activeTeam = sortedRoomTeams.find((t) => t.id === activeTeamId) || sortedRoomTeams[0] || room.teams[0];

  // Calculate team stats
  const teamsStats = sortedRoomTeams.map((t) => {
    const squadCount = t.squad?.length || t.totalPlayers || 0;
    const remainingToMin = Math.max(0, minSquad - squadCount);
    const maxSafeBid = calculateMaxSafeBid(t.currentPurse, squadCount, minSquad, minBasePrice);
    const avgPursePerSlot = remainingToMin > 0 ? t.currentPurse / remainingToMin : t.currentPurse;

    // Squad composition
    const squad = t.squad || [];
    const batters = squad.filter((s) => s.player?.role === 'BATSMAN').length;
    const bowlers = squad.filter((s) => s.player?.role === 'BOWLER').length;
    const allRounders = squad.filter((s) => s.player?.role === 'ALL_ROUNDER').length;
    const keepers = squad.filter((s) => s.player?.role === 'WICKET_KEEPER').length;
    const overseas = t.overseasCount || squad.filter((s) => s.player?.isOverseas).length;

    let health: 'HEALTHY' | 'MODERATE' | 'TIGHT' = 'HEALTHY';
    if (avgPursePerSlot < 15000000 && remainingToMin > 2) {
      health = 'TIGHT'; // < 1.5 Cr per slot
    } else if (avgPursePerSlot < 35000000 && remainingToMin > 2) {
      health = 'MODERATE'; // < 3.5 Cr per slot
    }

    return {
      ...t,
      squadCount,
      remainingToMin,
      maxSafeBid,
      avgPursePerSlot,
      batters,
      bowlers,
      allRounders,
      keepers,
      overseas,
      health,
    };
  });

  const activeStats = teamsStats.find((t) => t.id === activeTeam.id) || teamsStats[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Radar className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>Franchise Purse Radar &amp; Max Bid HUD</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
                  Live Analytics
                </span>
              </h2>
              <p className="text-[10px] text-slate-400">
                Mathematical safety limits, reserve allocations, and franchise requirements
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Active Franchise Spotlight Card */}
          {activeStats && (
            <div
              className="p-3.5 rounded-xl border relative overflow-hidden"
              style={{
                backgroundColor: `${activeStats.color}10`,
                borderColor: `${activeStats.color}40`,
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <TeamLogo
                    logo={activeStats.logo}
                    name={activeStats.name}
                    shortName={activeStats.shortName}
                    size="sm"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-black text-white">{activeStats.name}</h3>
                      {activeStats.id === myTeam?.id && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-300 font-bold">
                          YOUR TEAM
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Current Purse: <strong className="text-white">{formatRupeesCompact(activeStats.currentPurse)}</strong>
                    </span>
                  </div>
                </div>

                {/* Health Badge */}
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border ${
                      activeStats.health === 'HEALTHY'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : activeStats.health === 'MODERATE'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                    }`}
                  >
                    {activeStats.health === 'HEALTHY' ? (
                      <ShieldCheck className="w-3 h-3" />
                    ) : (
                      <ShieldAlert className="w-3 h-3" />
                    )}
                    <span>{activeStats.health} PURSE POWER</span>
                  </span>
                </div>
              </div>

              {/* 4 Analytics Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                    Max Safe Single Bid
                  </span>
                  <div className="text-sm font-black text-emerald-400 font-mono">
                    {formatRupeesCompact(activeStats.maxSafeBid)}
                  </div>
                  <span className="text-[9px] text-slate-500 leading-tight block mt-0.5">
                    Safely leaves min ₹20L for remaining slots
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                    Squad Slots
                  </span>
                  <div className="text-sm font-black text-white font-mono">
                    {activeStats.squadCount} / {minSquad}{' '}
                    <span className="text-[10px] text-slate-400 font-normal">
                      (Max {maxSquad})
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-500 block mt-0.5">
                    {activeStats.remainingToMin > 0
                      ? `${activeStats.remainingToMin} needed to meet min`
                      : 'Min squad threshold reached!'}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                    Overseas Slots
                  </span>
                  <div className="text-sm font-black text-cyan-400 font-mono">
                    {activeStats.overseas} / {maxOverseas}
                  </div>
                  <span className="text-[9px] text-slate-500 block mt-0.5">
                    {maxOverseas - activeStats.overseas} slots open
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                    Purse Per Slot
                  </span>
                  <div className="text-sm font-black text-amber-400 font-mono">
                    {formatRupeesCompact(activeStats.avgPursePerSlot)}
                  </div>
                  <span className="text-[9px] text-slate-500 block mt-0.5">
                    Average budget per open slot
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Franchise Comparison Matrix */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider">
                All 10 Franchises Financial Comparison
              </h4>
              <span className="text-[10px] text-slate-400">Click any franchise to spotlight</span>
            </div>

            <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950/60">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-900/90 text-slate-400 uppercase text-[9px] font-bold border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Franchise</th>
                    <th className="py-2 px-3 text-right">Remaining Purse</th>
                    <th className="py-2 px-3 text-right">Max Safe Bid</th>
                    <th className="py-2 px-3 text-center">Squad (Min {minSquad})</th>
                    <th className="py-2 px-3 text-center">Overseas (Max {maxOverseas})</th>
                    <th className="py-2 px-3 text-center">Role Balance (Bat/Bowl/AR/WK)</th>
                    <th className="py-2 px-3 text-center">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {teamsStats.map((t) => {
                    const isSelected = t.id === activeStats.id;
                    const isMine = t.id === myTeam?.id;

                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTeamId(t.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-slate-800/80 font-bold'
                            : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2 px-3 flex items-center gap-2">
                          <TeamLogo
                            logo={t.logo}
                            name={t.name}
                            shortName={t.shortName}
                            size="xs"
                          />
                          <span className="font-sans font-bold text-white text-xs">
                            {t.shortName}
                          </span>
                          {isMine && (
                            <span className="text-[8px] px-1 rounded bg-amber-500/20 text-amber-400 font-sans uppercase">
                              You
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-right font-black text-amber-300">
                          {formatRupeesCompact(t.currentPurse)}
                        </td>

                        <td className="py-2 px-3 text-right font-black text-emerald-400">
                          {formatRupeesCompact(t.maxSafeBid)}
                        </td>

                        <td className="py-2 px-3 text-center text-slate-300 font-sans">
                          {t.squadCount}/{minSquad}
                          {t.remainingToMin > 0 ? (
                            <span className="text-[9px] text-slate-500 ml-1">
                              ({t.remainingToMin} left)
                            </span>
                          ) : (
                            <span className="text-[9px] text-emerald-400 ml-1 font-bold">✓</span>
                          )}
                        </td>

                        <td className="py-2 px-3 text-center text-cyan-300">
                          {t.overseas}/{maxOverseas}
                        </td>

                        <td className="py-2 px-3 text-center font-sans text-[10px] text-slate-300">
                          <span title="Batters" className="text-amber-400 font-bold">{t.batters}B</span>
                          <span className="text-slate-600 mx-1">/</span>
                          <span title="Bowlers" className="text-cyan-400 font-bold">{t.bowlers}Bo</span>
                          <span className="text-slate-600 mx-1">/</span>
                          <span title="All Rounders" className="text-purple-400 font-bold">{t.allRounders}AR</span>
                          <span className="text-slate-600 mx-1">/</span>
                          <span title="Wicket Keepers" className="text-emerald-400 font-bold">{t.keepers}WK</span>
                        </td>

                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              t.health === 'HEALTHY'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : t.health === 'MODERATE'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {t.health}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Max Safe Bid ensures franchise reserve rules are never breached.</span>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
          >
            Close Radar
          </button>
        </div>
      </div>
    </div>
  );
};
