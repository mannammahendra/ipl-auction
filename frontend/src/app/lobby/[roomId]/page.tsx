'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuctionStore, Team, RoomMember } from '../../../lib/store';
import { api } from '../../../lib/api';
import { socketService } from '../../../lib/socket';
import { Navbar } from '../../../components/Navbar';
import { formatRupees } from '../../../lib/formatters';
import {
  Users,
  Shield,
  CheckCircle,
  Clock,
  Play,
  Settings,
  Share2,
  Check,
  AlertCircle,
  X,
  User as UserIcon,
  Trophy,
  Copy,
  MessageCircle,
  ExternalLink,
} from 'lucide-react';
import TeamLogo from '../../../components/TeamLogo';
import { copyToClipboard, shareOrCopyInvite } from '../../../lib/clipboard';

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;

  const { user, room, setRoom, setUser } = useAuctionStore();
  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesApplied, setRulesApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isNavigatingRef = useRef(false);

  const navigateToArena = useCallback((targetRoomId: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;

    router.push(`/auction/${targetRoomId}`);
  }, [router]);

  // Settings form state for host
  const [startingPurseCr, setStartingPurseCr] = useState<number>(120);
  const [timerSec, setTimerSec] = useState<number>(14);
  const [targetSquadSize, setTargetSquadSize] = useState<number>(11);
  const [overseasLimit, setOverseasLimit] = useState<number>(4);
  const [savingSettings, setSavingSettings] = useState(false);

  // Claim franchise modal & manager name
  const [selectedTeamForClaim, setSelectedTeamForClaim] = useState<Team | null>(null);
  const [managerNameInput, setManagerNameInput] = useState<string>('');
  const [claimingTeam, setClaimingTeam] = useState<boolean>(false);
  const [startingAuction, setStartingAuction] = useState<boolean>(false);
  const [roomAlert, setRoomAlert] = useState<string | null>(null);

  const isHost = Boolean(room && (room.hostId === user?.id || room.members?.some((m) => m.userId === user?.id && m.isHost)));
  const myMember = room?.members?.find((m) => m.userId === user?.id);
  const myTeamId = myMember?.teamId;

  const sortedLobbyTeams = useMemo(() => {
    if (!room?.teams) return [];
    return [...room.teams].sort((a, b) => {
      const aSelectedByMe = a.id === myTeamId;
      const bSelectedByMe = b.id === myTeamId;
      if (aSelectedByMe && !bSelectedByMe) return -1;
      if (!aSelectedByMe && bSelectedByMe) return 1;

      const aClaimed = room.members?.some((m: RoomMember) => m.teamId === a.id);
      const bClaimed = room.members?.some((m: RoomMember) => m.teamId === b.id);
      if (aClaimed && !bClaimed) return -1;
      if (!aClaimed && bClaimed) return 1;

      return a.name.localeCompare(b.name);
    });
  }, [room?.teams, myTeamId, room?.members]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        let storedToken =
          api.getToken() ||
          (typeof window !== 'undefined' ? localStorage.getItem('ipl_auction_token') : null) ||
          useAuctionStore.getState().token;

        if (!storedToken) {
          try {
            const guest = await api.auth.guest(`Manager_${Math.floor(1000 + Math.random() * 9000)}`);
            storedToken = guest.token;
            api.setToken(guest.token);
            setUser(guest.user, guest.token);
          } catch (e) {
            console.error('Failed to create guest user in lobby:', e);
          }
        }

        let currentUser = user;
        if (!currentUser && storedToken) {
          const profile = await api.auth.me().catch(() => null);
          if (profile) {
            setUser(profile, storedToken);
            currentUser = profile;
          }
        }

        const roomData = await api.rooms.get(roomId);
        if (roomData.status === 'AUCTION_ACTIVE') {
          router.push(`/auction/${roomData.id || roomId}`);
          return;
        }
        setRoom(roomData);
        setStartingPurseCr(roomData.startingPurse / 10000000);
        setTimerSec(roomData.bidTimerSeconds);
        setTargetSquadSize(roomData.minSquad || 11);
        setOverseasLimit(roomData.maxOverseas || 4);
        setLoading(false); // Instant render - never wait on websockets to show UI

        const socket = socketService.connect(storedToken || '');
        socketService.joinRoom(roomData.id);

        socket.on('room_sync', (data: any) => {
          if (data?.room) {
            setRoom(data.room);
            setStartingPurseCr(data.room.startingPurse / 10000000);
            setTimerSec(data.room.bidTimerSeconds);
            setTargetSquadSize(data.room.minSquad || 11);
            setOverseasLimit(data.room.maxOverseas || 4);
          }
        });

        socket.on('team_selected', (data: any) => {
          if (data?.room) {
            setRoom(data.room);
          }
          if (data?.message) {
            setRoomAlert(data.message);
            setTimeout(() => setRoomAlert(null), 3500);
          }
        });

        socket.on('settings_updated', (data: any) => {
          if (data?.room) {
            setRoom(data.room);
            setStartingPurseCr(data.room.startingPurse / 10000000);
            setTimerSec(data.room.bidTimerSeconds);
            setTargetSquadSize(data.room.minSquad || 11);
            setOverseasLimit(data.room.maxOverseas || 4);
          }
          if (data?.message) {
            setRoomAlert(data.message);
            setTimeout(() => setRoomAlert(null), 3500);
          }
        });

        socket.on('auction_started', () => {
          navigateToArena(roomData.id || roomId);
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load auction room');
        setLoading(false);
      }
    }

    if (roomId) {
      init();
    }

    // Backup polling heartbeat only when socket is disconnected
    const pollInterval = setInterval(async () => {
      if (socketService.getSocket()?.connected) return;
      try {
        const latest = await api.rooms.get(roomId);
        if (latest.status === 'AUCTION_ACTIVE') {
          navigateToArena(latest.id || roomId);
        } else {
          setRoom(latest);
        }
      } catch {
        // silent fallback if network is briefly reconnecting
      }
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      const socket = socketService.getSocket();
      if (socket) {
        socket.off('room_sync');
        socket.off('team_selected');
        socket.off('settings_updated');
        socket.off('auction_started');
      }
    };
  }, [roomId, router, setUser, setRoom]);

  const handleOpenClaimModal = (team: Team) => {
    setSelectedTeamForClaim(team);
    setManagerNameInput(user?.username || '');
    setError(null);
  };

  const handleConfirmClaimTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room || !selectedTeamForClaim || claimingTeam) return;
    const trimmed = managerNameInput.trim();
    if (!trimmed) {
      setError('Please enter your manager name');
      return;
    }

    const teamToClaim = selectedTeamForClaim;
    try {
      setClaimingTeam(true);
      setError(null);
      setSelectedTeamForClaim(null);

      const updatedRoom = await api.rooms.selectTeam(room.id, teamToClaim.id, trimmed);
      setRoom(updatedRoom);

      if (user && user.username !== trimmed) {
        const token = localStorage.getItem('ipl_auction_token') || '';
        setUser({ ...user, username: trimmed }, token);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to claim team');
    } finally {
      setClaimingTeam(false);
    }
  };

  const handleToggleReady = async () => {
    if (!room) return;
    const currentMember = room.members?.find((m) => m.userId === user?.id);
    if (!currentMember) return;
    const newReady = !currentMember.isReady;

    // Instant optimistic toggle - zero latency!
    setRoom({
      ...room,
      members: room.members.map((m) =>
        m.id === currentMember.id ? { ...m, isReady: newReady } : m
      ),
    });

    try {
      await api.rooms.toggleReady(room.id);
    } catch (err: any) {
      setError(err.message);
      // Revert if failed
      setRoom({
        ...room,
        members: room.members.map((m) =>
          m.id === currentMember.id ? { ...m, isReady: !newReady } : m
        ),
      });
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    try {
      setSavingSettings(true);
      setError(null);
      const squad = Number(targetSquadSize) || 11;
      const overseas = Math.min(Math.max(1, Number(overseasLimit) || 4), squad);
      const purse = (Number(startingPurseCr) || 120) * 10000000;
      const timer = Number(timerSec) || 15;

      const updated = await api.rooms.updateSettings(room.id, {
        startingPurse: purse,
        bidTimerSeconds: timer,
        squadSize: squad,
        minSquad: squad,
        maxSquad: Math.max(squad, 18),
        maxOverseas: overseas,
      });
      setRoom(updated);
      setRulesApplied(true);
      setSavingSettings(false);
      setTimeout(() => setRulesApplied(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update rules');
      setSavingSettings(false);
    }
  };

  const handleStartAuction = async () => {
    if (!room || startingAuction || isNavigatingRef.current) return;
    setStartingAuction(true);
    setError(null);
    try {


      // 2. Prefetch arena route
      router.prefetch(`/auction/${room.id}`);

      // 3. Ensure the latest settings selected in the lobby (timerSec, squadSize, etc.) are saved to room!
      const squad = Number(targetSquadSize) || 11;
      const overseas = Math.min(Math.max(1, Number(overseasLimit) || 4), squad);
      const purse = (Number(startingPurseCr) || 120) * 10000000;
      const timer = Number(timerSec) || 15;

      const updated = await api.rooms.updateSettings(room.id, {
        startingPurse: purse,
        bidTimerSeconds: timer,
        squadSize: squad,
        minSquad: squad,
        maxSquad: Math.max(squad, 18),
        maxOverseas: overseas,
      });
      setRoom(updated);

      // 4. Start auction using REST API with host Bearer token
      await api.auction.start(room.id);

      // 5. Navigate to arena instantly
      navigateToArena(room.id);
    } catch (err: any) {
      console.error('Failed to start auction:', err);
      setError(err.message || 'Failed to start auction');
      setStartingAuction(false);
      isNavigatingRef.current = false;
    }
  };

  const handleOpenInvite = () => {
    setInviteModalOpen(true);
  };

  const handleCopyInviteLink = async () => {
    if (typeof window !== 'undefined' && room) {
      const inviteUrl = `${window.location.origin}/?join=${room.code}`;
      await copyToClipboard(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyRoomCode = async () => {
    if (room?.code) {
      await copyToClipboard(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleNativeShare = async () => {
    if (typeof window !== 'undefined' && room) {
      const inviteUrl = `${window.location.origin}/?join=${room.code}`;
      await shareOrCopyInvite({
        title: 'IPL Mega Auction Invite',
        roomName: room.name,
        roomCode: room.code,
        url: inviteUrl,
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-400">Loading IPL Auction Lobby...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-2" />
        <h2 className="text-xl font-bold">Room Not Found</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">{error || 'Unable to join room.'}</p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
        >
          Return Home
        </button>
      </div>
    );
  }


  return (
    <div className="min-h-screen text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-3">
        <div className="ios-glass-elevated p-4 sm:p-5 mb-3 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ROOM: {room.code}
              </span>
              {room.status === 'COMPLETED' ? (
                <span className="flex items-center gap-1.5 text-xs font-black px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  🏆 AUCTION COMPLETED
                </span>
              ) : room.status === 'AUCTION_ACTIVE' ? (
                <span className="flex items-center gap-1.5 text-xs font-black px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  AUCTION IN PROGRESS
                </span>
              ) : (
                <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                  LOBBY STAGE
                </span>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
              {room.name}
            </h1>
            {room.status === 'COMPLETED' ? (
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                The auction has concluded! All franchise squads and financial balances are finalized.
              </p>
            ) : room.status === 'AUCTION_ACTIVE' ? (
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                The live auction is underway! You can return to the arena floor at any time.
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5 w-full md:w-auto">
            <button
              onClick={handleOpenInvite}
              className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Invite Friends</span>
            </button>

            {room.status === 'COMPLETED' ? (
              <button
                onClick={() => router.push(`/auction/${room.id || roomId}`)}
                className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 font-black text-xs text-slate-950 uppercase tracking-wider shadow-lg transition-all hover:scale-105 active:scale-95"
              >
                <Trophy className="w-3.5 h-3.5 fill-slate-950" />
                <span>View Final Squads</span>
              </button>
            ) : room.status === 'AUCTION_ACTIVE' ? (
              <button
                onClick={() => router.push(`/auction/${room.id || roomId}`)}
                className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 font-black text-xs text-slate-950 uppercase tracking-wider shadow-lg shadow-amber-950/40 transition-all hover:scale-105 active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                <span>⚡ Return to Live Arena</span>
              </button>
            ) : isHost ? (
              <button
                onClick={handleStartAuction}
                disabled={startingAuction}
                className="flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-50 font-black text-xs text-slate-950 uppercase tracking-wider shadow-lg shadow-emerald-950/40 transition-all hover:scale-105 active:scale-95"
              >
                {startingAuction ? (
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                )}
                <span>{startingAuction ? 'Starting...' : 'Start Auction'}</span>
              </button>
            ) : (
              <button
                onClick={handleToggleReady}
                className={`flex-1 md:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                  myMember?.isReady
                    ? 'bg-emerald-600/30 border border-emerald-500/60 text-emerald-300'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{myMember?.isReady ? 'Ready!' : 'Mark Ready'}</span>
              </button>
            )}
          </div>
        </div>

        {room.status === 'AUCTION_ACTIVE' && (
          <div className="mb-3 p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/15 to-rose-500/15 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg shrink-0">
                🏏
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-amber-300 tracking-wide flex items-center gap-2">
                  <span>AUCTION IS LIVE &amp; IN PROGRESS</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Bidding rounds are actively occurring. You can jump right back into the live podium at any moment.
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/auction/${room.id || roomId}`)}
              className="w-full sm:w-auto px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-all hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center gap-2"
            >
              <span>⚡ Enter Live Arena</span>
              <Play className="w-3.5 h-3.5 fill-slate-950" />
            </button>
          </div>
        )}

        {room.status === 'COMPLETED' && (
          <div className="mb-3 p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-yellow-500/20 border border-amber-500/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg shrink-0">
                🏆
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-amber-300 tracking-wide flex items-center gap-2">
                  <span>AUCTION CONCLUDED &amp; SQUADS SEALED</span>
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  All 10 franchises have locked in their squads. Check the team cards below or enter the arena to inspect full rosters.
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push(`/auction/${room.id || roomId}`)}
              className="w-full sm:w-auto px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-all hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center gap-2"
            >
              <span>Inspect Arena &amp; Squads</span>
              <Play className="w-3.5 h-3.5 fill-slate-950" />
            </button>
          </div>
        )}

        {roomAlert && (
          <div className="mb-3 p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between gap-2.5 animate-in slide-in-from-top-2 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm">🔔</span>
              <span className="font-bold">{roomAlert}</span>
            </div>
            <button onClick={() => setRoomAlert(null)} className="p-0.5 hover:bg-amber-500/30 rounded text-amber-300">
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {error && (
          <div className="mb-3 p-2.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Choose Your Franchise ({room.teams?.length} Available)</span>
              </h2>
              <span className="text-xs text-slate-400">
                Purse: <strong className="text-amber-400 font-mono">{formatRupees(room.startingPurse)}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {sortedLobbyTeams.map((team: Team) => {
                const isSelectedByMe = team.id === myTeamId;
                const claimedMember = room.members?.find((m: RoomMember) => m.teamId === team.id);
                const isClaimedByOther = claimedMember && claimedMember.userId !== user?.id;

                return (
                  <div
                    key={team.id}
                    onClick={() => !isClaimedByOther && handleOpenClaimModal(team)}
                    className={`p-2.5 rounded-xl border-2 transition-all relative overflow-hidden ${
                      isClaimedByOther
                        ? 'opacity-60 bg-slate-950/60 border-slate-800/80 cursor-not-allowed'
                        : isSelectedByMe
                        ? 'bg-slate-800 border-amber-400 shadow-xl ring-2 ring-amber-400/40 cursor-default'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-600 hover:bg-slate-800/60 cursor-pointer'
                    }`}
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-1"
                      style={{ backgroundColor: team.color }}
                    />

                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2.5">
                        <TeamLogo logo={team.logo} name={team.name} shortName={team.shortName} size="md" />
                        <div>
                          <h3 className="font-extrabold text-xs sm:text-sm text-white">{team.name}</h3>
                          <span
                            className="text-xs font-mono font-bold"
                            style={{ color: team.color }}
                          >
                            {team.shortName}
                          </span>
                        </div>
                      </div>

                      {isSelectedByMe && (
                        <span className="flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950">
                          <Check className="w-3 h-3" />
                          YOURS
                        </span>
                      )}

                      {isClaimedByOther && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          CLAIMED
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/80">
                      <span>Purse: {formatRupees(team.initialPurse)}</span>
                      {claimedMember ? (
                        <span className="text-slate-300 font-medium">
                          👤 {claimedMember.user?.username}
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-bold">Available</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Participants ({room.members?.length})
                  </h3>
                </div>
              </div>

              <div className="space-y-1.5">
                {room.members?.map((member: RoomMember) => {
                  const memberTeam = room.teams?.find((t) => t.id === member.teamId);
                  const isCurrent = member.userId === user?.id;

                  return (
                    <div
                      key={member.id}
                      className="p-1.5 px-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            member.isOnline ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-200">
                              {member.user?.username}
                            </span>
                            {isCurrent && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                                YOU
                              </span>
                            )}
                            {member.isHost && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">
                                HOST
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5">
                            {memberTeam ? (
                              <div className="flex items-center gap-1.5">
                                <TeamLogo logo={memberTeam.logo} name={memberTeam.name} shortName={memberTeam.shortName} size="xs" />
                                <span className="text-[10px] text-slate-300 font-medium">{memberTeam.name}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">No team chosen</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        {member.isReady ? (
                          <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Ready
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Selecting
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-800 mb-2.5">
                <Settings className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  Auction Rules & Settings
                </h3>
              </div>

              {isHost ? (
                <form onSubmit={handleSaveSettings} className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                      Starting Purse (Crores)
                    </label>
                    <input
                      type="number"
                      min={50}
                      max={200}
                      value={startingPurseCr}
                      onChange={(e) => {
                        setStartingPurseCr(Number(e.target.value));
                        setRulesApplied(false);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                      Compulsory Squad Size
                    </label>
                    <select
                      value={targetSquadSize}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setTargetSquadSize(val);
                        if (val === 11) setOverseasLimit(4);
                        else if (val === 25) setOverseasLimit(8);
                        else if (val === 15) setOverseasLimit(5);
                        else if (val === 18) setOverseasLimit(6);
                        setRulesApplied(false);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                    >
                      <option value={11}>11 Players (Playing XI)</option>
                      <option value={15}>15 Players (Match Squad)</option>
                      <option value={18}>18 Players (Compact)</option>
                      <option value={25}>25 Players (Full IPL Squad)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                      Max Overseas Players Per Squad
                    </label>
                    <select
                      value={overseasLimit}
                      onChange={(e) => {
                        setOverseasLimit(Number(e.target.value));
                        setRulesApplied(false);
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-blue-400 font-bold focus:outline-none focus:border-amber-500"
                    >
                      {targetSquadSize === 11 ? (
                        <>
                          <option value={4}>4 Overseas (Standard XI)</option>
                          <option value={3}>3 Overseas</option>
                          <option value={2}>2 Overseas</option>
                          <option value={0}>0 Overseas (All-Indian)</option>
                        </>
                      ) : (
                        <>
                          <option value={8}>8 Overseas (Official IPL)</option>
                          <option value={6}>6 Overseas</option>
                          <option value={4}>4 Overseas</option>
                          <option value={10}>10 Overseas</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">
                      Countdown Timer (Seconds)
                    </label>
                    <select
                      value={timerSec}
                      onChange={async (e) => {
                        const val = Number(e.target.value);
                        setTimerSec(val);
                        setRulesApplied(false);
                        if (room && isHost) {
                          try {
                            const updated = await api.rooms.updateSettings(room.id, {
                              bidTimerSeconds: val,
                            });
                            setRoom(updated);
                            setRulesApplied(true);
                            setTimeout(() => setRulesApplied(false), 2500);
                          } catch (err) {}
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value={10}>10 Seconds (Hyper Blitz)</option>
                      <option value={12}>12 Seconds (Fast Clock)</option>
                      <option value={14}>14 Seconds (Quick Action)</option>
                      <option value={20}>20 Seconds (Standard Action)</option>
                      <option value={25}>25 Seconds (Official IPL)</option>
                      <option value={30}>30 Seconds (Relaxed Tactical)</option>
                    </select>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-[10px] text-slate-400">
                    <span className="text-amber-400 font-bold mr-1">Rule:</span>
                    Each franchise must buy exactly <strong>{targetSquadSize} players</strong>. Max {overseasLimit} overseas players (or all {targetSquadSize} Indian).
                  </div>

                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="w-full py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 border border-amber-500/40 text-xs font-black text-slate-950 transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {savingSettings ? 'Applying Rules...' : rulesApplied ? 'Rules Applied' : 'Apply Rules'}
                  </button>
                </form>
              ) : (
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Starting Purse</span>
                    <span className="font-bold text-amber-400">{formatRupees(room.startingPurse)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Compulsory Squad</span>
                    <span className="font-bold text-amber-300">{room.minSquad} players required</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Max Overseas</span>
                    <span className="font-bold text-cyan-400">{room.maxOverseas} players (optional)</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Bid Timer</span>
                    <span className="font-bold text-slate-200">{room.bidTimerSeconds}s</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Claim Franchise Modal */}
        {selectedTeamForClaim && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
              <div
                className="h-1.5 w-full"
                style={{ backgroundColor: selectedTeamForClaim.color }}
              />
              <div className="p-3.5 sm:p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <TeamLogo logo={selectedTeamForClaim.logo} name={selectedTeamForClaim.name} shortName={selectedTeamForClaim.shortName} size="sm" />
                    <div>
                      <h3 className="font-extrabold text-sm text-white">
                        {selectedTeamForClaim.name}
                      </h3>
                      <span
                        className="text-[11px] font-mono font-bold"
                        style={{ color: selectedTeamForClaim.color }}
                      >
                        Code: {selectedTeamForClaim.shortName}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedTeamForClaim(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleConfirmClaimTeam} className="space-y-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-300 block mb-0.5">
                      Your Manager Name
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        maxLength={30}
                        value={managerNameInput}
                        onChange={(e) => setManagerNameInput(e.target.value)}
                        placeholder="e.g. Rohan, King Kohli"
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                      <UserIcon className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-2" />
                    </div>
                  </div>

                  <div className="pt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTeamForClaim(null)}
                      className="flex-1 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={claimingTeam}
                      className="flex-1 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-xs font-black text-slate-950 uppercase tracking-wider shadow-md transition-transform active:scale-95 disabled:opacity-50"
                    >
                      {claimingTeam ? 'Claiming...' : 'Claim Franchise'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Invite & Share Modal */}
        {inviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-5 relative">
              <button
                onClick={() => setInviteModalOpen(false)}
                className="absolute top-4 right-4 p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-2xl mx-auto mb-2.5">
                  🏏
                </div>
                <h3 className="text-base font-black text-white">Invite Friends to Auction</h3>
                <p className="text-xs text-slate-400 mt-0.5">Share room code or invite link to join</p>
              </div>

              {/* Room Code Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mb-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">ROOM CODE</span>
                <div className="text-2xl font-black font-mono tracking-widest text-amber-400 my-1">
                  {room.code}
                </div>
                <button
                  onClick={handleCopyRoomCode}
                  className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{copiedCode ? 'Room Code Copied!' : 'Copy Code Only'}</span>
                </button>
              </div>

              {/* Direct Link & Share Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleCopyInviteLink}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
                  <span>{copiedLink ? 'Invite Link Copied!' : 'Copy Direct Join Link'}</span>
                </button>

                {isMounted && (
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`🏏 Join my IPL Mega Auction Room: ${room.name}!\nRoom Code: ${room.code}\nJoin link: ${typeof window !== 'undefined' ? window.location.origin : ''}/?join=${room.code}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Share on WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
