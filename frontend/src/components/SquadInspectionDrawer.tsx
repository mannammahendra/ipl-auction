'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAuctionStore, Team } from '../lib/store';
import { formatRupees } from '../lib/formatters';
import {
  X,
  Trophy,
  Users,
  Globe2,
  Coins,
  ShieldAlert,
  Search,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Share2,
} from 'lucide-react';
import TeamLogo from './TeamLogo';
import { SquadPosterModal } from './SquadPosterModal';
import { PlayerPortrait } from './PlayerPortrait';

interface SquadInspectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedTeamId?: string;
}

export function SquadInspectionDrawer({
  isOpen,
  onClose,
  initialSelectedTeamId,
}: SquadInspectionDrawerProps) {
  const { room, user } = useAuctionStore();

  const myMember = room?.members?.find((m) => m.userId === user?.id);
  const myTeamId = myMember?.teamId;
  const selectedTeamIds = useMemo(() => {
    return new Set(
      (room?.members || [])
        .map((m) => m.teamId)
        .filter((id): id is string => Boolean(id))
    );
  }, [room?.members]);

  const teams = useMemo(() => {
    if (!room?.teams) return [];
    return [...room.teams].sort((a, b) => {
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
  }, [room?.teams, myTeamId, selectedTeamIds]);

  const auctionPlayers = room?.auctionPlayers || [];

  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [posterTeam, setPosterTeam] = useState<Team | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialSelectedTeamId) {
      setSelectedTeamId(initialSelectedTeamId);
    } else if (teams.length > 0 && !selectedTeamId) {
      const myMember = room?.members?.find((m) => m.userId === user?.id);
      if (myMember?.teamId) {
        setSelectedTeamId(myMember.teamId);
      } else {
        setSelectedTeamId(teams[0].id);
      }
    }
  }, [initialSelectedTeamId, teams, room?.members, user?.id, selectedTeamId]);

  const selectedTeam = useMemo(() => {
    return teams.find((t) => t.id === selectedTeamId) || teams[0] || null;
  }, [teams, selectedTeamId]);

  // Find all players purchased by this team (harmonized from both squad and auctionPlayers)
  const teamPurchasedPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    const list: any[] = [];
    const seen = new Set<string>();

    if (selectedTeam.squad && Array.isArray(selectedTeam.squad)) {
      selectedTeam.squad.forEach((m) => {
        const idKey = m.playerId || m.player?.id || m.id;
        if (idKey && !seen.has(idKey) && m.player) {
          seen.add(idKey);
          list.push({
            id: m.auctionPlayerId || `squad_${m.id}`,
            playerId: m.playerId,
            teamId: selectedTeam.id,
            soldToTeamId: selectedTeam.id,
            status: 'SOLD',
            soldPrice: m.purchasePrice,
            player: m.player,
          });
        }
      });
    }

    if (auctionPlayers && Array.isArray(auctionPlayers)) {
      auctionPlayers
        .filter((ap) => ap.status === 'SOLD' && ap.soldToTeamId === selectedTeam.id)
        .forEach((ap) => {
          const idKey = ap.playerId || ap.player?.id || ap.id;
          if (idKey && !seen.has(idKey) && ap.player) {
            seen.add(idKey);
            list.push(ap);
          }
        });
    }

    return list;
  }, [auctionPlayers, selectedTeam]);

  // Filter players by role and search query
  const filteredPlayers = useMemo(() => {
    return teamPurchasedPlayers.filter((ap) => {
      const p = ap.player;
      if (!p) return false;
      const matchesRole =
        roleFilter === 'ALL' ||
        (roleFilter === 'OVERSEAS' && p.isOverseas) ||
        p.role === roleFilter;
      const matchesSearch =
        searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.country.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRole && matchesSearch;
    });
  }, [teamPurchasedPlayers, roleFilter, searchQuery]);

  // Calculate reserve rules
  const minSquad = room?.minSquad || 11;
  const maxSquad = room?.maxSquad || 25;
  const maxOverseas = room?.maxOverseas || 4;
  const currentTotal = teamPurchasedPlayers.length;
  const currentOverseas = teamPurchasedPlayers.filter((ap) => ap.player?.isOverseas).length;

  const slotsNeededForMin = Math.max(0, minSquad - (currentTotal + 1));
  const reserveFund = slotsNeededForMin * 3000000; // ₹30L per remaining minimum slot
  const currentPurse = selectedTeam ? selectedTeam.currentPurse : 0;
  const maxBidCapacity = Math.max(0, currentPurse - reserveFund);

  const scrollTabs = (direction: 'left' | 'right') => {
    if (tabsRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      tabsRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[96vw] lg:max-w-6xl h-[92vh] max-h-[920px] bg-slate-900/95 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white tracking-wide flex items-center gap-2">
                <span>Franchise Squad Inspection</span>
                <span className="text-[9px] font-black px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  OFFICIAL ROSTERS
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Detailed squad player cards, purse compliance &amp; live reserve analysis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {selectedTeam && (
              <button
                onClick={() => setPosterTeam(selectedTeam)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs tracking-wider transition-all active:scale-95 shadow"
                title="Open Shareable Squad Poster, Graphic & CSV Export"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Squad</span>
                <span>Poster</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Franchise Selector Bar with Dedicated Scroller Buttons */}
        <div className="relative flex items-center px-3 py-1.5 border-b border-slate-800 bg-slate-950/70">
          <button
            type="button"
            onClick={() => scrollTabs('left')}
            className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0 shadow-sm mr-1.5 z-10 active:scale-95 border border-slate-700/60"
            title="Scroll teams left"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <div
            ref={tabsRef}
            className="flex-1 flex gap-1.5 overflow-x-auto squad-scrollbar py-0.5"
          >
            {teams.map((team) => {
              const isSelected = team.id === selectedTeam?.id;
              const accentColor = team.color || '#f59e0b';
              const teamPlayerCount = auctionPlayers.filter(
                (ap) => ap.status === 'SOLD' && ap.soldToTeamId === team.id
              ).length;

              return (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                    isSelected
                      ? 'bg-slate-800/90 text-white shadow-lg ring-1 ring-white/20'
                      : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                  style={{
                    borderColor: isSelected ? accentColor : undefined,
                  }}
                >
                  <TeamLogo logo={team.logo} name={team.name} shortName={team.shortName} size="xs" />
                  <span className="font-extrabold">{team.shortName || team.name.slice(0, 3)}</span>
                  <span
                    className="px-1.5 py-0.2 rounded-md text-[9px] font-black"
                    style={{
                      backgroundColor: `${accentColor}25`,
                      color: accentColor,
                    }}
                  >
                    {teamPlayerCount}/{minSquad}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollTabs('right')}
            className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0 shadow-sm ml-1.5 z-10 active:scale-95 border border-slate-700/60"
            title="Scroll teams right"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Selected Franchise Summary Header */}
        {selectedTeam && (
          <div className="p-3 sm:p-3.5 border-b border-slate-800 bg-slate-950/40">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 mb-2.5">
              <div className="flex items-center gap-2.5">
                <TeamLogo
                  logo={selectedTeam.logo}
                  name={selectedTeam.name}
                  shortName={selectedTeam.shortName}
                  size="md"
                />
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">{selectedTeam.name}</h3>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <UserCheck className="w-3 h-3 text-slate-500" />
                    <span>
                      Managed by{' '}
                      <strong className="text-slate-200">
                        {room?.members?.find((m) => m.teamId === selectedTeam.id)?.user?.username || 'Open'}
                      </strong>
                    </span>
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                  Remaining Purse
                </span>
                <span className="text-xl font-black text-emerald-400 tracking-tight font-mono">
                  {formatRupees(selectedTeam.currentPurse)}
                </span>
              </div>
            </div>

            {/* Metrics grid allocating across screen */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-1.5 px-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1 text-slate-400 text-[10px] font-semibold mb-0.5">
                  <Users className="w-3 h-3 text-blue-400" />
                  <span>Squad Size</span>
                </div>
                <div className="text-xs sm:text-sm font-black text-white">
                  {currentTotal}{' '}
                  <span className="text-[10px] text-slate-500 font-normal">/ {maxSquad}</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5">Target: {minSquad} players</p>
              </div>

              <div className="p-1.5 px-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1 text-slate-400 text-[10px] font-semibold mb-0.5">
                  <Globe2 className="w-3 h-3 text-indigo-400" />
                  <span>Overseas</span>
                </div>
                <div className="text-xs sm:text-sm font-black text-white">
                  {currentOverseas}{' '}
                  <span className="text-[10px] text-slate-500 font-normal">/ {maxOverseas}</span>
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5">
                  {Math.max(0, maxOverseas - currentOverseas)} slots remaining
                </p>
              </div>

              <div className="p-1.5 px-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1 text-slate-400 text-[10px] font-semibold mb-0.5">
                  <Coins className="w-3 h-3 text-amber-400" />
                  <span>Max Bid Cap</span>
                </div>
                <div className="text-xs sm:text-sm font-black text-amber-300 font-mono">
                  {formatRupees(maxBidCapacity)}
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5">Purse minus reserve</p>
              </div>

              <div className="p-1.5 px-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                <div className="flex items-center gap-1 text-slate-400 text-[10px] font-semibold mb-0.5">
                  <ShieldAlert className="w-3 h-3 text-rose-400" />
                  <span>Locked Reserve</span>
                </div>
                <div className="text-xs sm:text-sm font-black text-slate-300 font-mono">
                  {formatRupees(reserveFund)}
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5">₹30L × {slotsNeededForMin} slots</p>
              </div>
            </div>
          </div>
        )}

        {/* Search & Role Filters Bar */}
        <div className="px-3 py-1.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-950/60">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search acquired player or country..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin squad-scrollbar py-0.5">
            {['ALL', 'BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER', 'OVERSEAS'].map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                  roleFilter === role
                    ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/60'
                }`}
              >
                {role.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Responsive Player Roster Grid Allocating Across Screen Size */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-3.5 squad-scrollbar">
          {filteredPlayers.length === 0 ? (
            <div className="text-center py-20 px-4">
              <Users className="w-14 h-14 text-slate-700 mx-auto mb-3" />
              <h4 className="text-base font-bold text-slate-300 mb-1">
                {teamPurchasedPlayers.length === 0
                  ? 'No players acquired yet'
                  : 'No players match current filter'}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {teamPurchasedPlayers.length === 0
                  ? `This franchise has their full ${formatRupees(
                      selectedTeam?.currentPurse
                    )} purse available for upcoming auctions.`
                  : 'Try changing the role filter or search query.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3.5">
              {filteredPlayers.map((ap) => {
                const p = ap.player;
                if (!p) return null;
                return (
                  <div
                    key={ap.id}
                    className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-600 flex flex-col justify-between gap-3 transition-all hover:bg-slate-950/90 group shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      {/* High-res player photo with fallback */}
                      <div className="relative shrink-0">
                        <PlayerPortrait player={p} className="w-14 h-16 rounded-xl" />
                        {p.isOverseas && (
                          <span className="absolute bottom-0 right-0 px-1 py-0.5 rounded-tl-md bg-blue-600 text-[8px] font-black text-white z-10">
                            OS
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate" title={p.name}>
                          {p.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-semibold text-slate-300">
                            {p.role.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {p.country}
                          </span>
                        </div>
                        {p.battingStyle && (
                          <p className="text-[10px] text-slate-500 mt-1 truncate">
                            {p.battingStyle}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Acquisition Price and Details */}
                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase block">
                          Sold Price
                        </span>
                        <span className="text-sm font-black text-emerald-400 font-mono">
                          {formatRupees(ap.soldPrice)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-bold text-slate-500 uppercase block">
                          Base Price
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 font-mono">
                          {formatRupees(p.basePrice)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>
              Players: <strong className="text-white">{teamPurchasedPlayers.length}</strong>/{minSquad}
            </span>
            <span>&bull;</span>
            <span>
              Spent:{' '}
              <strong className="text-emerald-400 font-mono">
                {formatRupees(
                  teamPurchasedPlayers.reduce((sum, ap) => sum + (ap.soldPrice || 0), 0)
                )}
              </strong>
            </span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors border border-slate-700 active:scale-95"
          >
            Close
          </button>
        </div>
      </div>

      <SquadPosterModal
        isOpen={!!posterTeam}
        onClose={() => setPosterTeam(null)}
        team={posterTeam}
      />
    </div>
  );
}
