'use client';

import React, { useState, useMemo } from 'react';
import { useAuctionStore, Team } from '../lib/store';
import { formatRupees } from '../lib/formatters';
import { Users, Globe, Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import TeamLogo from './TeamLogo';
import { PlayerPortrait } from './PlayerPortrait';

interface FranchiseLeaderboardProps {
  onSelectTeam?: (team: Team) => void;
}

export const FranchiseLeaderboard = React.memo(function FranchiseLeaderboard({ onSelectTeam }: FranchiseLeaderboardProps) {
  const room = useAuctionStore((s) => s.room);
  const user = useAuctionStore((s) => s.user);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const myMember = room?.members?.find((m) => m.userId === user?.id);
  const myTeamId = myMember?.teamId;

  // Track all team IDs claimed by players in the room
  const selectedTeamIds = React.useMemo(() => {
    return new Set(
      (room?.members || [])
        .map((m) => m.teamId)
        .filter((id): id is string => Boolean(id))
    );
  }, [room?.members]);

  const sortedTeams = React.useMemo(() => {
    if (!room?.teams) return [];

    return [...room.teams].sort((a, b) => {
      const aIsMyTeam = a.id === myTeamId;
      const bIsMyTeam = b.id === myTeamId;

      // 1. My chosen franchise is always pinned to the very top
      if (aIsMyTeam && !bIsMyTeam) return -1;
      if (!aIsMyTeam && bIsMyTeam) return 1;

      const aIsSelected = selectedTeamIds.has(a.id);
      const bIsSelected = selectedTeamIds.has(b.id);

      // 2. Selected/claimed franchises come first, unselected ones go below
      if (aIsSelected && !bIsSelected) return -1;
      if (!aIsSelected && bIsSelected) return 1;

      // 3. Within the same group, sort by remaining purse descending, then by name
      if (b.currentPurse !== a.currentPurse) {
        return b.currentPurse - a.currentPurse;
      }
      return a.name.localeCompare(b.name);
    });
  }, [room?.teams, selectedTeamIds, myTeamId]);

  if (!room || !room.teams) return null;

  const toggleTeam = (teamId: string) => {
    setExpandedTeamId((prev) => (prev === teamId ? null : teamId));
  };

  return (
    <div id="franchise-purses-section" className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-3.5 shadow-xl flex flex-col backdrop-blur-md">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
            Franchise Purses & Squads
          </h3>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] text-slate-400 font-mono">
            Starting: {formatRupees(room.startingPurse)}
          </span>
          <span className="text-[9px] text-slate-500 hidden sm:inline">
            (Click team or Inspect to view squad)
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {sortedTeams.map((team, idx) => {
          const isMyTeam = team.id === myMember?.teamId;
          const claimedMember = room.members?.find((m) => m.teamId === team.id);
          const isClaimedByOther = claimedMember && claimedMember.userId !== user?.id;
          const isSelected = isMyTeam || Boolean(claimedMember);
          const pursePercent = Math.max(0, Math.min(100, (team.currentPurse / room.startingPurse) * 100));
          const isExpanded = expandedTeamId === team.id;

          const teamSoldPlayers = isExpanded
            ? (room.auctionPlayers || []).filter(
                (ap) => ap.status === 'SOLD' && ap.soldToTeamId === team.id
              )
            : [];

          const isFirstUnselected = !isSelected && idx > 0 && selectedTeamIds.size > 0 && (
            sortedTeams[idx - 1].id === myTeamId || selectedTeamIds.has(sortedTeams[idx - 1].id)
          );

          return (
            <React.Fragment key={team.id}>
              {isFirstUnselected && (
                <div className="flex items-center gap-2 pt-2 pb-0.5 px-1">
                  <div className="h-px flex-1 bg-slate-800" />
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                    Unselected Franchises
                  </span>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>
              )}
              <div
                className={`rounded-xl border transition-all ${
                  isMyTeam
                    ? 'bg-slate-800/90 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                    : isClaimedByOther
                    ? 'bg-slate-900/90 border-indigo-500/40 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Clickable Team Summary Row */}
                <div
                  onClick={() => toggleTeam(team.id)}
                  className="py-1.5 px-3 cursor-pointer select-none flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo logo={team.logo} name={team.name} shortName={team.shortName} size="xs" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-slate-200">{team.shortName}</span>
                        {isMyTeam && (
                          <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                            YOU
                          </span>
                        )}
                        {isClaimedByOther && claimedMember && (
                          <span className="text-[8px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0 truncate max-w-[100px]" title={`Managed by ${claimedMember.user?.username || 'Player'}`}>
                            👤 {claimedMember.user?.username || 'PLAYER'}
                          </span>
                        )}
                      </div>
                    <span className="text-[9px] text-slate-400 block truncate max-w-[130px] sm:max-w-none">
                      {team.name}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                  <div className="text-right">
                    <span className="font-mono text-xs sm:text-sm font-extrabold text-amber-400 block">
                      {formatRupees(team.currentPurse)}
                    </span>
                    <div className="flex items-center justify-end gap-1.5 text-[9px] text-slate-400">
                      <span className="flex items-center gap-0.5" title="Total players">
                        <Users className="w-2.5 h-2.5 text-slate-500" />
                        {team.totalPlayers}/{room.maxSquad}
                      </span>
                      <span className="flex items-center gap-0.5" title="Overseas players">
                        <Globe className="w-2.5 h-2.5 text-cyan-500" />
                        {team.overseasCount}/{room.maxOverseas}
                      </span>
                    </div>
                  </div>

                  {/* Inspect Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTeam(team.id);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors flex items-center gap-1 ${
                      isExpanded
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Purse Bar */}
              <div className="px-3 pb-1.5">
                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pursePercent}%`,
                      backgroundColor: team.color || '#eab308',
                    }}
                  />
                </div>
              </div>

              {/* Inline Squad List directly below the team */}
              {isExpanded && (
                <div className="px-2.5 pb-2.5 pt-1 border-t border-slate-800/80 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between py-1 text-xs">
                    <span className="font-extrabold uppercase tracking-wider text-amber-400 text-[10px]">
                      {team.name} Squad ({teamSoldPlayers.length} / {room.maxSquad})
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      Spent: {formatRupees(room.startingPurse - team.currentPurse)}
                    </span>
                  </div>

                  {teamSoldPlayers.length === 0 ? (
                    <div className="py-4 px-3 rounded-xl bg-slate-900/60 border border-slate-800/60 text-center">
                      <p className="text-xs text-slate-400">
                        No players acquired yet by {team.shortName}. Available Purse: {formatRupees(team.currentPurse)}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-96 overflow-y-auto pr-1">
                      {teamSoldPlayers.map((ap) => {
                        const p = ap.player;
                        return (
                          <div
                            key={ap.id}
                            className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors shadow-sm"
                          >
                            <PlayerPortrait player={p} className="w-11 h-11 rounded-lg" />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-bold text-white truncate" title={p.name}>
                                {p.name}
                              </h4>
                              <div className="flex items-center justify-between gap-1 mt-0.5">
                                <span className="text-[10px] text-slate-400 truncate">
                                  {p.role}
                                </span>
                                <span className="text-[11px] font-mono font-black text-amber-400 shrink-0">
                                  {formatRupees(ap.soldPrice || p.basePrice)}
                                </span>
                              </div>
                              <div className="text-[9px] text-slate-500 mt-0.5">
                                {p.isOverseas ? '✈️ Overseas' : '🇮🇳 India'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}
      </div>
    </div>
  );
});
