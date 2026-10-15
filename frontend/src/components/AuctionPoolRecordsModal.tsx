'use client';

import React, { useState, useMemo } from 'react';
import { useAuctionStore } from '../lib/store';
import { formatRupees } from '../lib/formatters';
import {
  X,
  Search,
  Trophy,
  Flame,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Zap,
} from 'lucide-react';
import TeamLogo from './TeamLogo';
import { socketService } from '../lib/socket';
import { getPlayerPhoto, getPlayerBasePriceList, BASE_PRICE_LISTS } from '../lib/playerPhotos';

interface AuctionPoolRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'UPCOMING' | 'SOLD' | 'UNSOLD' | 'HIGHEST_BID';
}

export function AuctionPoolRecordsModal({
  isOpen,
  onClose,
  initialTab = 'UPCOMING',
}: AuctionPoolRecordsModalProps) {
  const { room, currentAuctionPlayer, user } = useAuctionStore();

  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'SOLD' | 'UNSOLD' | 'HIGHEST_BID'>(
    initialTab
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [listFilter, setListFilter] = useState('ALL');

  const auctionPlayers = room?.auctionPlayers || [];
  const teams = room?.teams || [];
  const isHost = room?.hostId === user?.id;

  const handleRecallPlayer = (auctionPlayerId: string) => {
    if (!room) return;
    socketService.recallPlayer(room.id, auctionPlayerId);
  };

  const handleStartAccelerated = () => {
    if (!room) return;
    socketService.startAcceleratedRound(room.id, 15);
  };

  // Categorize players
  const upcomingPlayers = useMemo(
    () =>
      auctionPlayers.filter(
        (ap) => ap.status === 'UPCOMING' || ap.status === 'NOMINATED'
      ),
    [auctionPlayers]
  );

  const soldPlayers = useMemo(
    () =>
      auctionPlayers
        .filter((ap) => ap.status === 'SOLD' && (ap.soldPrice || 0) > 0)
        .sort((a, b) => (b.soldPrice || 0) - (a.soldPrice || 0)),
    [auctionPlayers]
  );

  const unsoldPlayers = useMemo(
    () => auctionPlayers.filter((ap) => ap.status === 'UNSOLD'),
    [auctionPlayers]
  );

  const highestBidPlayers = useMemo(() => {
    return [...soldPlayers].sort((a, b) => (b.soldPrice || 0) - (a.soldPrice || 0));
  }, [soldPlayers]);

  const totalSpent = useMemo(
    () => soldPlayers.reduce((acc, curr) => acc + (curr.soldPrice || 0), 0),
    [soldPlayers]
  );

  // Active tab pool before category/search filter
  const currentTabBaseList = useMemo(() => {
    switch (activeTab) {
      case 'UPCOMING':
        return upcomingPlayers;
      case 'SOLD':
        return soldPlayers;
      case 'UNSOLD':
        return unsoldPlayers;
      case 'HIGHEST_BID':
        return highestBidPlayers;
      default:
        return upcomingPlayers;
    }
  }, [activeTab, upcomingPlayers, soldPlayers, unsoldPlayers, highestBidPlayers]);

  // Dynamic role counts for the CURRENT active tab
  const roleCounts = useMemo(() => {
    return {
      ALL: currentTabBaseList.length,
      BATSMAN: currentTabBaseList.filter((ap) => ap.player?.role === 'BATSMAN').length,
      BOWLER: currentTabBaseList.filter((ap) => ap.player?.role === 'BOWLER').length,
      ALL_ROUNDER: currentTabBaseList.filter((ap) => ap.player?.role === 'ALL_ROUNDER').length,
      WICKET_KEEPER: currentTabBaseList.filter((ap) => ap.player?.role === 'WICKET_KEEPER').length,
      OVERSEAS: currentTabBaseList.filter((ap) => ap.player?.isOverseas).length,
    };
  }, [currentTabBaseList]);

  // Filtered list matching role filter and search query
  const filteredList = useMemo(() => {
    return currentTabBaseList.filter((ap) => {
      const p = ap.player;
      if (!p) return false;
      const matchesSearch =
        searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.country.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole =
        roleFilter === 'ALL' ||
        (roleFilter === 'OVERSEAS' && p.isOverseas) ||
        p.role === roleFilter;
      const playerList = getPlayerBasePriceList(p.basePrice);
      const matchesList = listFilter === 'ALL' || playerList.listCode === listFilter;
      return matchesSearch && matchesRole && matchesList;
    });
  }, [currentTabBaseList, searchQuery, roleFilter, listFilter]);

  if (!isOpen) return null;

  const roleDefinitions = [
    { key: 'ALL', label: 'ALL', count: roleCounts.ALL },
    { key: 'BATSMAN', label: 'BATSMAN', count: roleCounts.BATSMAN },
    { key: 'BOWLER', label: 'BOWLER', count: roleCounts.BOWLER },
    { key: 'ALL_ROUNDER', label: 'ALL ROUNDER', count: roleCounts.ALL_ROUNDER },
    { key: 'WICKET_KEEPER', label: 'WICKET KEEPER', count: roleCounts.WICKET_KEEPER },
    { key: 'OVERSEAS', label: 'OVERSEAS', count: roleCounts.OVERSEAS },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-wide">
                Player Hub & Records
              </h2>
              <p className="text-xs text-slate-400">
                Live auction pool, sold rosters, and marquee transfer records
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons - Compact & Small */}
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1.5 flex-nowrap">
            <button
              onClick={() => {
                setActiveTab('UPCOMING');
                setRoleFilter('ALL');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                activeTab === 'UPCOMING'
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Upcoming</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                  activeTab === 'UPCOMING'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-slate-900 text-slate-400'
                }`}
              >
                {upcomingPlayers.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('SOLD');
                setRoleFilter('ALL');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                activeTab === 'SOLD'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Sold</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                  activeTab === 'SOLD'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-slate-900 text-slate-400'
                }`}
              >
                {soldPlayers.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('UNSOLD');
                setRoleFilter('ALL');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                activeTab === 'UNSOLD'
                  ? 'bg-rose-500 text-white shadow-sm font-black'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <AlertCircle className="w-3 h-3" />
              <span>Unsold</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                  activeTab === 'UNSOLD'
                    ? 'bg-slate-950/30 text-white'
                    : 'bg-slate-900 text-slate-400'
                }`}
              >
                {unsoldPlayers.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('HIGHEST_BID');
                setRoleFilter('ALL');
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                activeTab === 'HIGHEST_BID'
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-950 shadow-sm font-black'
                  : 'bg-slate-800/80 text-amber-300 hover:bg-slate-700'
              }`}
            >
              <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span>Highest Bid<span className="hidden sm:inline"> Player</span></span>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                  activeTab === 'HIGHEST_BID'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-slate-900 text-amber-400'
                }`}
              >
                {highestBidPlayers.length}
              </span>
            </button>
          </div>

          {activeTab === 'SOLD' && (
            <div className="text-[11px] font-bold text-slate-400 shrink-0">
              Spent:{' '}
              <strong className="text-emerald-400 font-mono text-xs">
                {formatRupees(totalSpent)}
              </strong>
            </div>
          )}
        </div>

        {/* Universal Search & Role Filter Bar with Dynamic Counts */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${activeTab.toLowerCase().replace('_', ' ')} players by name or country...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Dynamic Role Filter Buttons with exact count for current tab */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 md:pb-0">
            {roleDefinitions.map((role) => {
              const isSelected = roleFilter === role.key;
              return (
                <button
                  key={role.key}
                  onClick={() => setRoleFilter(role.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                      : 'bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700 border border-slate-700/60'
                  }`}
                >
                  <span>{role.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold ${
                      isSelected
                        ? 'bg-slate-950/25 text-slate-950'
                        : 'bg-slate-900/90 text-amber-400'
                    }`}
                  >
                    {role.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Official IPL Base Price Lists Filter Strip */}
        <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/70 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Base Price Sets:
          </span>
          <button
            onClick={() => setListFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all shrink-0 ${
              listFilter === 'ALL'
                ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/60'
            }`}
          >
            All Sets
          </button>
          {BASE_PRICE_LISTS.map((list) => {
            const isSelected = listFilter === list.listCode;
            return (
              <button
                key={list.listCode}
                onClick={() => setListFilter(isSelected ? 'ALL' : list.listCode)}
                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all shrink-0 border ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 border-amber-300 font-black shadow-sm'
                    : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {list.shortLabel}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Empty State */}
          {filteredList.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto mb-3 text-xl">
                🏏
              </div>
              <h4 className="text-sm font-bold text-slate-300 mb-1">
                No players match your filter
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery || roleFilter !== 'ALL'
                  ? 'Try clearing the search query or selecting ALL categories.'
                  : `No players in the ${activeTab.toLowerCase()} category yet.`}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Special Marquee Header for Highest Bid Tab */}
              {activeTab === 'HIGHEST_BID' && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-orange-500/15 border border-amber-500/30 flex items-center justify-between mb-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500 text-slate-950 font-black shadow-md">
                      <Flame className="w-5 h-5 fill-slate-950" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">
                        Auction Hall of Fame & Marquee Buys
                      </h3>
                      <p className="text-xs text-slate-400">
                        Ranked by highest final price in this auction room
                      </p>
                    </div>
                  </div>

                  {highestBidPlayers.length > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Record Hammer
                      </span>
                      <span className="text-lg sm:text-xl font-black text-amber-400 font-mono">
                        {formatRupees(highestBidPlayers[0]?.soldPrice)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {filteredList.map((ap, index) => {
                const p = ap.player;
                if (!p) return null;
                const isCurrent = currentAuctionPlayer?.id === ap.id;
                const winningTeam = teams.find((t) => t.id === ap.soldToTeamId);
                const accentColor = winningTeam?.color || '#f59e0b';

                const medals = ['🥇', '🥈', '🥉'];
                const rankBadge =
                  activeTab === 'HIGHEST_BID'
                    ? index < 3
                      ? medals[index]
                      : `#${index + 1}`
                    : null;

                return (
                  <div
                    key={ap.id}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                      isCurrent
                        ? 'bg-amber-500/15 border-amber-500/80 ring-2 ring-amber-500/50 shadow-lg shadow-amber-500/10'
                        : activeTab === 'HIGHEST_BID' && index === 0
                        ? 'bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 border-amber-500/60 shadow-md'
                        : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Lot or Rank */}
                      {rankBadge ? (
                        <span className="text-xl font-black w-8 text-center">{rankBadge}</span>
                      ) : (
                        <span className="w-8 h-8 rounded-lg bg-slate-800 text-[11px] font-black text-slate-400 flex items-center justify-center font-mono shrink-0">
                          #{ap.lotNumber}
                        </span>
                      )}

                      {/* Prominent Player Picture Thumbnail */}
                      <div className="w-12 h-14 rounded-xl bg-slate-900 border border-slate-700/80 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                        <img
                          src={getPlayerPhoto(p)}
                          alt={p.name}
                          className="w-full h-full object-cover object-top hover:scale-110 transition-transform duration-200 rounded-xl"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              p.name
                            )}&background=0f172a&color=f8fafc&size=128&bold=true`;
                          }}
                        />
                      </div>

                      {/* Player Info */}
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-sm font-bold text-white">{p.name}</h4>
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-black border ${getPlayerBasePriceList(p.basePrice).badgeClass}`}>
                            {getPlayerBasePriceList(p.basePrice).shortLabel}
                          </span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-[10px] font-black text-slate-950 flex items-center gap-1 animate-pulse">
                              <Sparkles className="w-3 h-3" /> LIVE ON STAGE
                            </span>
                          )}
                          {p.isOverseas ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-900/60 border border-blue-700/60 text-[9px] font-black text-blue-300">
                              ✈️ OS
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-900/40 border border-emerald-700/40 text-[9px] font-black text-emerald-300">
                              🇮🇳 IND
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          {p.role.replace('_', ' ')} &bull; {p.country}
                        </p>
                      </div>
                    </div>

                    {/* Right Price & Status Column */}
                    <div className="flex items-center gap-3 sm:gap-4">
                      {/* Sold / Winning Team details */}
                      {(activeTab === 'SOLD' || activeTab === 'HIGHEST_BID') && winningTeam && (
                        <div className="text-right hidden sm:block">
                          <span className="text-[10px] text-slate-500 block uppercase font-bold">
                            Bought By
                          </span>
                          <span
                            className="inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-lg border bg-white/5"
                            style={{
                              borderColor: `${accentColor}40`,
                              color: accentColor,
                            }}
                          >
                            <TeamLogo logo={winningTeam.logo} name={winningTeam.name} shortName={winningTeam.shortName} size="xs" />
                            <span>{winningTeam.shortName || winningTeam.name}</span>
                          </span>
                        </div>
                      )}

                      {/* Price Display */}
                      <div className="text-right min-w-[80px]">
                        {activeTab === 'UPCOMING' && (
                          <>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              Base Price
                            </span>
                            <span className="text-sm font-black text-amber-300 font-mono">
                              {formatRupees(p.basePrice)}
                            </span>
                          </>
                        )}

                        {(activeTab === 'SOLD' || activeTab === 'HIGHEST_BID') && (
                          <>
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              Hammer Price
                            </span>
                            <span className="text-sm sm:text-base font-black text-emerald-400 font-mono">
                              {formatRupees(ap.soldPrice)}
                            </span>
                          </>
                        )}

                        {activeTab === 'UNSOLD' && (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">
                              Base Price
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-slate-300 font-mono">
                              {formatRupees(p.basePrice)}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRecallPlayer(ap.id);
                              }}
                              className="px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] tracking-wider transition-all active:scale-95 shadow flex items-center gap-1 shrink-0"
                              title="Recall this unsold player back into the auction pool"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Recall</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Total Players in Pool: <strong className="text-white">{auctionPlayers.length}</strong>
          </span>

          <div className="flex items-center gap-2">
            {isHost && activeTab === 'UNSOLD' && unsoldPlayers.length > 0 && (
              <button
                onClick={handleStartAccelerated}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-95"
                title="Start Accelerated Round with 15s blitz timer"
              >
                <Zap className="w-3.5 h-3.5 fill-slate-950" />
                <span>Start Accelerated Blitz Round</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
