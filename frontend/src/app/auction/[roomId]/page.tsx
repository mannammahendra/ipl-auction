'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuctionStore, Team } from '../../../lib/store';
import { api } from '../../../lib/api';
import { socketService } from '../../../lib/socket';
import { auctioneerVoice } from '../../../lib/voice';
import { PlayerProfileCard } from '../../../components/PlayerProfileCard';
import { PlayerCareerFormatsCard } from '../../../components/PlayerCareerFormatsCard';
import { LiveBiddingStage } from '../../../components/LiveBiddingStage';
import { FranchiseLeaderboard } from '../../../components/FranchiseLeaderboard';
import { BidHistoryModal } from '../../../components/BidHistoryModal';
import { HostControls } from '../../../components/HostControls';
import { SoldCelebrationModal } from '../../../components/SoldCelebrationModal';
import { SquadInspectionDrawer } from '../../../components/SquadInspectionDrawer';
import { AuctionPoolRecordsModal } from '../../../components/AuctionPoolRecordsModal';
import { MicrophoneControl } from '../../../components/MicrophoneControl';
import { RoomChatDrawer } from '../../../components/RoomChatDrawer';
import { FloatingAuctionBar } from '../../../components/FloatingAuctionBar';
import { PurseRadarModal } from '../../../components/PurseRadarModal';
import { SquadPosterModal } from '../../../components/SquadPosterModal';
import { voiceChatManager } from '../../../lib/voiceChat';
import TeamLogo from '../../../components/TeamLogo';
import {
  AlertCircle,
  ArrowLeft,
  Trophy,
  Activity,
  Volume2,
  VolumeX,
  MessageSquare,
  Users,
  Copy,
  Check,
  Radar,
  Zap,
  Share2,
  X,
  ShieldAlert,
} from 'lucide-react';
import { formatRupees } from '../../../lib/formatters';
import { copyToClipboard } from '../../../lib/clipboard';

export default function LiveAuctionArenaPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;

  const {
    user,
    room,
    currentAuctionPlayer,
    currentBids,
    unreadChatCount,
    setChatOpen,
    setUser,
    setRoom,
    setTimer,
    syncRoomState,
    onBidPlaced,
    onPlayerNominated,
    onPlayerSold,
    onPlayerUnsold,
    acceleratedNotice,
    roundCompletedNotice,
    isAccelerated,
  } = useAuctionStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [squadsDrawerOpen, setSquadsDrawerOpen] = useState(false);
  const [selectedDrawerTeam, setSelectedDrawerTeam] = useState<Team | null>(null);
  const [recordsModalOpen, setRecordsModalOpen] = useState(false);
  const [recordsModalTab, setRecordsModalTab] = useState<'UPCOMING' | 'SOLD' | 'UNSOLD' | 'HIGHEST_BID'>('UPCOMING');
  const [bidHistoryModalOpen, setBidHistoryModalOpen] = useState(false);
  const [radarModalOpen, setRadarModalOpen] = useState(false);
  const [squadPosterTeam, setSquadPosterTeam] = useState<Team | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [bidAlert, setBidAlert] = useState<string | null>(null);
  const [hostAlert, setHostAlert] = useState<{ id: string; message: string; type?: string } | null>(null);
  const lastAnnouncedPlayerIdRef = useRef<string | null>(null);

  const triggerHostAlert = (message: string, type?: string) => {
    setHostAlert({ id: String(Date.now()), message, type });
    setTimeout(() => {
      setHostAlert((current) => (current?.message === message ? null : current));
    }, 4500);
  };

  useEffect(() => {
    setVoiceEnabled(auctioneerVoice.isEnabled());
    auctioneerVoice.unlockAudio();
  }, []);

  const handleCopyCode = async () => {
    if (room?.code) {
      await copyToClipboard(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  useEffect(() => {
    async function init() {
      try {
        let storedToken =
          api.getToken() ||
          (typeof window !== 'undefined' ? localStorage.getItem('ipl_auction_token') : null) ||
          useAuctionStore.getState().token;

        if (!storedToken) {
          try {
            const guest = await api.auth.guest(`Viewer_${Math.floor(1000 + Math.random() * 9000)}`);
            storedToken = guest.token;
            api.setToken(guest.token);
            setUser(guest.user, guest.token);
          } catch (e) {
            console.error('Failed to create guest user in auction:', e);
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
        setRoom(roomData);
        auctioneerVoice.unlockAudio();

        if (!useAuctionStore.getState().currentAuctionPlayer) {
          setTimer(roomData.bidTimerSeconds || 25);
        }

        // Vocalize current player if fresh auction start (no bids yet placed, not reconnecting mid-lot)
        if (
          roomData.status === 'AUCTION_ACTIVE' &&
          roomData.currentAuctionPlayer?.status === 'NOMINATED' &&
          roomData.currentAuctionPlayer?.player &&
          (!roomData.currentBidAmount || roomData.currentBidAmount === 0)
        ) {
          const cap = roomData.currentAuctionPlayer;
          const canonicalId = cap.id || cap.player.id;
          if (canonicalId && canonicalId !== lastAnnouncedPlayerIdRef.current) {
            lastAnnouncedPlayerIdRef.current = canonicalId;
            setTimeout(() => {
              auctioneerVoice.announceNomination(cap.player.name, cap.player.role, canonicalId);
            }, 300);
          }
        }

        setLoading(false); // Instant render - never leave user staring at a spinner

        const socket = socketService.connect(storedToken || '');
        socketService.joinRoom(roomData.id);

        socket.on('room_sync', (data: any) => {
          syncRoomState(data);
        });

        const zeroFallbackTimeoutRef = { current: null as any };
        const clearZeroFallback = () => {
          if (zeroFallbackTimeoutRef.current) {
            clearTimeout(zeroFallbackTimeoutRef.current);
            zeroFallbackTimeoutRef.current = null;
          }
        };

        // 1. Timer countdown: Loud countdown for last 5 to 0 seconds (5, 4, 3, 2, 1, 0) synchronized with Blitz speed
        socket.on('timer_tick', (data: { remainingSeconds: number; speedMultiplier?: number }) => {
          setTimer(data.remainingSeconds);
          if (data.speedMultiplier) {
            useAuctionStore.getState().setSpeedMultiplier(data.speedMultiplier);
          }
          auctioneerVoice.onTimerTick(data.remainingSeconds, data.speedMultiplier);

          const currentRoom = useAuctionStore.getState().room;
          const currentAP = useAuctionStore.getState().currentAuctionPlayer;
          const isAuctionActive = (currentRoom?.status === 'AUCTION_ACTIVE' || !currentRoom?.status) && !currentRoom?.isPaused;
          const isPlayerNominated = currentAP?.status === 'NOMINATED';

          if (isAuctionActive && isPlayerNominated && data.remainingSeconds <= 5 && data.remainingSeconds >= 0) {
            auctioneerVoice.announceCountdown(data.remainingSeconds, currentAP?.id);
          } else if (data.remainingSeconds > 5) {
            auctioneerVoice.resetCountdown();
          }

          if (data.remainingSeconds === 0) {
            clearZeroFallback();
            const activePlayerId = useAuctionStore.getState().currentAuctionPlayer?.id;
            zeroFallbackTimeoutRef.current = setTimeout(() => {
              const currentAP = useAuctionStore.getState().currentAuctionPlayer;
              if (currentAP && currentAP.status === 'NOMINATED' && currentAP.id === activePlayerId) {
                socketService.notifyTimerExpired(roomId, activePlayerId);
              }
            }, 1200);
          } else {
            clearZeroFallback();
          }
        });

        // 2. Bid placed: Speak out Team and Amount in natural voice (e.g. "CSK 2 Crore" or "MI 40 Crore")
        socket.on('bid_placed', (data: any) => {
          clearZeroFallback();
          onBidPlaced(data);
          const teamShort =
            data.team?.shortName ||
            data.bid?.team?.shortName ||
            data.team?.name ||
            data.bid?.team?.name ||
            'Bidder';
          const bidAmount = Number(data.amount || data.bidAmount || data.bid?.amount || 0);
          const activePlayerId = useAuctionStore.getState().currentAuctionPlayer?.id;
          auctioneerVoice.announceBid(teamShort, bidAmount, activePlayerId);
        });

        // 3. Player nominated: Full player name & type (e.g. "Virat Kohli, Batsman")
        socket.on('player_nominated', (data: any) => {
          clearZeroFallback();
          onPlayerNominated(data);
          auctioneerVoice.resetBiddingCadence();
          const ap = data.auctionPlayer;
          const p = ap?.player;
          const canonicalId = ap?.id || p?.id;
          const playerName = p?.name || ap?.name;
          const playerRole = p?.role || ap?.role;
          if (playerName) {
            lastAnnouncedPlayerIdRef.current = canonicalId;
            auctioneerVoice.announceNomination(playerName, playerRole, canonicalId);
          }
        });

        // 4. Sold: Clearly announce player name, winning franchise, and final sale amount
        socket.on('player_sold', (data: any) => {
          clearZeroFallback();
          onPlayerSold(data);
          auctioneerVoice.stopCountdown();

          const currentRoom = useAuctionStore.getState().room;
          const currentAP = useAuctionStore.getState().currentAuctionPlayer;

          const winningTeam =
            data.winningTeam ||
            currentRoom?.teams?.find(
              (t: any) =>
                t.id === data.auctionPlayer?.soldToTeamId ||
                t.id === data.squadMember?.teamId ||
                t.id === data.auctionPlayer?.soldToTeam?.id
            ) ||
            data.auctionPlayer?.soldToTeam ||
            data.squadMember?.team;

          const teamName =
            winningTeam?.name ||
            winningTeam?.shortName ||
            data.team?.name ||
            data.team?.shortName ||
            'Winning Franchise';

          const playerName =
            data.auctionPlayer?.player?.name ||
            data.squadMember?.player?.name ||
            currentAP?.player?.name ||
            'Player';

          const soldPrice = Number(
            data.soldPrice ??
            data.auctionPlayer?.soldPrice ??
            currentAP?.soldPrice ??
            0
          );

          lastAnnouncedPlayerIdRef.current = null;

          auctioneerVoice.announceSold(playerName, teamName, soldPrice);
        });

        // 5. Unsold: Announce player unsold result
        socket.on('player_unsold', (data: any) => {
          clearZeroFallback();
          onPlayerUnsold(data);
          auctioneerVoice.stopCountdown();
          lastAnnouncedPlayerIdRef.current = null;
          const currentAP = useAuctionStore.getState().currentAuctionPlayer;
          const playerName =
            data.auctionPlayer?.player?.name ||
            currentAP?.player?.name ||
            'Player';
          auctioneerVoice.announceUnsold(playerName);
        });

        socket.on('auction_paused', (data: any) => {
          auctioneerVoice.stop();
          const currentRoom = useAuctionStore.getState().room;
          if (currentRoom) {
            useAuctionStore.getState().setRoom({ ...currentRoom, isPaused: true });
          }
          setTimer(data?.remainingSeconds ?? useAuctionStore.getState().remainingTimer, true);
          triggerHostAlert(data?.message || '⏸️ Host paused the auction', 'pause');
        });

        socket.on('auction_resumed', (data: any) => {
          const currentRoom = useAuctionStore.getState().room;
          if (currentRoom) {
            useAuctionStore.getState().setRoom({ ...currentRoom, isPaused: false });
          }
          setTimer(data?.remainingSeconds ?? useAuctionStore.getState().remainingTimer, false);
          triggerHostAlert(data?.message || '▶️ Host resumed the auction', 'resume');
        });

        socket.on('player_skipped', (data: any) => {
          auctioneerVoice.stop();
          triggerHostAlert(data?.message || `⏭️ Host skipped ${data?.playerName || 'player'}`, 'skip');
        });

        socket.on('action_undone', (data: any) => {
          auctioneerVoice.stop();
          if (data?.teams) {
            const currentRoom = useAuctionStore.getState().room;
            if (currentRoom) {
              useAuctionStore.getState().setRoom({
                ...currentRoom,
                teams: data.teams,
              });
            }
          }
          triggerHostAlert(data?.message || '↩️ Host undid the last hammer action', 'undo');
        });

        socket.on('auction_speed_changed', (data: any) => {
          if (data?.speedMultiplier) {
            useAuctionStore.getState().setSpeedMultiplier(data.speedMultiplier);
            auctioneerVoice.setTimerSpeed(data.speedMultiplier);
          }
          triggerHostAlert(data?.message || `⚡ Auction speed changed to ${data?.speedMultiplier}x Blitz!`, 'blitz');
        });

        socket.on('auction_ended', (data: any) => {
          auctioneerVoice.stop();
          if (data?.room) {
            setRoom(data.room);
          }
          triggerHostAlert(data?.message || '🛑 Host has concluded the auction.', 'end');
        });

        socket.on('auction_completed', (data: any) => {
          auctioneerVoice.stop();
          if (data?.room) {
            setRoom(data.room);
          }
          triggerHostAlert(data?.message || '🏆 Auction is completed!', 'end');
        });

        socket.on('team_selected', (data: any) => {
          if (data?.room) {
            setRoom(data.room);
          }
          if (data?.message) {
            triggerHostAlert(data.message, 'team');
          }
        });

        // Accelerated Round & Player Recall Events
        socket.on('round_completed', (data: any) => {
          useAuctionStore.getState().onRoundCompleted(data);
          auctioneerVoice.announceRoundCompleted(data.round, data.unsoldAvailable, data.intermissionSeconds);
        });

        socket.on('accelerated_round_started', (data: any) => {
          useAuctionStore.getState().onAcceleratedRoundStarted(data);
          auctioneerVoice.announceAcceleratedRound(data.round, data.timerSeconds);
        });

        socket.on('player_recalled', (data: any) => {
          useAuctionStore.getState().onPlayerRecalled(data);
          auctioneerVoice.announcePlayerRecalled(data.auctionPlayer?.player?.name || 'Player');
        });

        // 6. Real-time Room Messages
        socket.on('new_message', (msg: any) => {
          useAuctionStore.getState().addMessage(msg);
        });

        // 7. WebRTC Live Voice Chat & Microphone events
        socket.on('voice_joined', (data: any) => {
          if (data.peers && Array.isArray(data.peers)) {
            data.peers.forEach((peer: any) => {
              useAuctionStore.getState().addVoiceParticipant(peer);
            });
          }
          voiceChatManager.handleVoiceJoined(data.peers || []);
        });

        socket.on('voice_user_joined', (user: any) => {
          useAuctionStore.getState().addVoiceParticipant(user);
          voiceChatManager.handleUserJoined(user);
        });

        socket.on('voice_user_left', (data: { socketId: string; userId: string }) => {
          useAuctionStore.getState().removeVoiceParticipant(data.socketId);
          voiceChatManager.handleUserLeft(data.socketId);
        });

        socket.on('voice_signal', (data: { fromSocketId: string; signal: any }) => {
          voiceChatManager.handleVoiceSignal(data.fromSocketId, data.signal);
        });

        socket.on('voice_state_changed', (data: any) => {
          useAuctionStore.getState().updateVoiceParticipantState(data.socketId, {
            isMuted: data.isMuted,
            isSpeaking: data.isSpeaking,
          });
        });

        // 8. Bid Error and Server Error Handling
        socket.on('bid_error', (data: { message?: string }) => {
          setBidAlert(data?.message || 'Bid rejected by server');
          setTimeout(() => setBidAlert(null), 4000);
        });

        socket.on('error', (data: { message?: string }) => {
          setBidAlert(data?.message || 'Auction error occurred');
          setTimeout(() => setBidAlert(null), 4000);
        });

        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to connect to auction arena');
        setLoading(false);
      }
    }

    if (roomId) {
      init();
    }

    return () => {
      const socket = socketService.getSocket();
      if (socket) {
        socket.off('room_sync');
        socket.off('timer_tick');
        socket.off('bid_placed');
        socket.off('player_nominated');
        socket.off('player_sold');
        socket.off('player_unsold');
        socket.off('auction_paused');
        socket.off('auction_resumed');
        socket.off('player_skipped');
        socket.off('action_undone');
        socket.off('auction_speed_changed');
        socket.off('auction_ended');
        socket.off('auction_completed');
        socket.off('team_selected');
        socket.off('round_completed');
        socket.off('accelerated_round_started');
        socket.off('player_recalled');
        socket.off('new_message');
        socket.off('voice_joined');
        socket.off('voice_user_joined');
        socket.off('voice_user_left');
        socket.off('voice_signal');
        socket.off('voice_state_changed');
        socket.off('bid_error');
        socket.off('error');
      }
      voiceChatManager.stopVoice();
      auctioneerVoice.stop();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [roomId]);

  const handleOpenTeamSquad = (team: Team) => {
    setSelectedDrawerTeam(team);
    setSquadsDrawerOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-400">Entering Live Auction Arena...</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-2" />
        <h2 className="text-xl font-bold">Arena Connection Error</h2>
        <p className="text-xs text-slate-400 mt-1 mb-4">{error || 'Room not found.'}</p>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
        >
          Return Home
        </button>
      </div>
    );
  }

  const totalPoolCount = room.auctionPlayers?.length || 0;
  const myMember = room.members?.find((m) => m.userId === user?.id);
  const myTeam = room.teams?.find((t) => t.id === myMember?.teamId);
  const isHost = Boolean(
    room &&
      user &&
      (room.hostId === user.id || room.members?.some((m) => m.userId === user.id && m.isHost))
  );

  return (
    <div className="min-h-screen text-slate-100 flex flex-col pb-16 relative">
      {/* Floating Bid Alert Toast */}
      {bidAlert && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-rose-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-2xl border border-rose-400 flex items-center gap-2 animate-bounce backdrop-blur-md">
          <AlertCircle className="w-4 h-4 text-white shrink-0" />
          <span>{bidAlert}</span>
          <button onClick={() => setBidAlert(null)} className="ml-2 p-0.5 hover:bg-rose-700 rounded transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Host Action Notification Toast */}
      {hostAlert && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/95 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-2xl border border-amber-500/80 flex items-center gap-2.5 animate-in slide-in-from-top-4 backdrop-blur-xl ring-2 ring-amber-500/30">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{hostAlert.message}</span>
          <button onClick={() => setHostAlert(null)} className="ml-2 p-0.5 hover:bg-slate-800 rounded transition-colors text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sleek iOS 27 Glassmorphic Top Bar with Horizontal Roll Bar for small screens & landscape mode */}
      <header className="sticky top-0 z-40 ios-glass border-b border-white/10 shadow-2xl">
        <div className="w-full overflow-x-auto header-rollbar py-1 px-3 sm:px-6">
          <div className="flex items-center justify-between gap-2.5 sm:gap-3.5 min-w-max max-w-7xl mx-auto">
            {/* Left Cluster: Back to Home/Lobby + Room code */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700/80 hover:border-slate-500 hover:bg-slate-700 text-[11px] font-bold text-slate-300 hover:text-white transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
                title="Return to Home (Create or Join Room)"
              >
                <ArrowLeft className="w-3 h-3" />
                <span>Lobby</span>
              </button>

              {/* Room Code Badge */}
              <button
                onClick={handleCopyCode}
                title="Click to copy room code"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-700/80 hover:border-amber-500/50 text-slate-300 transition-colors text-[11px] font-mono shrink-0 whitespace-nowrap"
              >
                <span className="text-slate-500 text-[9px]">ROOM:</span>
                <span className="font-bold text-amber-400">{room.code}</span>
                {copiedCode ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 text-slate-400" />}
              </button>
            </div>

            {/* Right Cluster: My Team + 1. Pool + 2. Voice Commentary + 3. Mic + 4. Messages + 5. History + 6. Squads */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Current User Team Pill */}
              {myTeam && (
                <div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold shadow-sm shrink-0 whitespace-nowrap"
                  style={{
                    backgroundColor: `${myTeam.color}15`,
                    borderColor: `${myTeam.color}50`,
                    color: myTeam.color,
                  }}
                >
                  <TeamLogo logo={myTeam.logo} name={myTeam.name} shortName={myTeam.shortName} size="xs" />
                  <span className="font-black text-xs">{myTeam.shortName}</span>
                  <span className="text-slate-300 text-[10px] font-mono">
                    ({formatRupees(myTeam.currentPurse)})
                  </span>
                </div>
              )}

              {/* 1. MINGLED UNIFIED BUTTON: Pool & Records */}
              <button
                onClick={() => {
                  setRecordsModalTab('UPCOMING');
                  setRecordsModalOpen(true);
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-[11px] font-bold text-amber-300 border border-amber-500/50 transition-all active:scale-95 shadow-sm shrink-0 whitespace-nowrap"
                title="Open Auction Pool & Records (Upcoming, Sold, Unsold, Top Bids)"
              >
                <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Pool</span>
                <span className="px-1 py-0.2 rounded bg-amber-500/25 text-amber-300 font-mono text-[9px]">
                  {totalPoolCount}
                </span>
              </button>

              {/* 2. VOICE MUTE / UNMUTE BUTTON (2nd Button) */}
              <button
                onClick={() => {
                  const next = auctioneerVoice.toggle();
                  setVoiceEnabled(next);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold border transition-all active:scale-95 shrink-0 whitespace-nowrap shadow-sm ${
                  voiceEnabled
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-rose-500/15 text-rose-300 border-rose-500/40 hover:bg-rose-500/25'
                }`}
                title={voiceEnabled ? 'Mute Commentary Voice' : 'Unmute Commentary Voice'}
              >
                {voiceEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Mute</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span>Unmute</span>
                  </>
                )}
              </button>

              {/* 3. LIVE MICROPHONE (Voice Chat) */}
              <MicrophoneControl roomId={roomId} />

              {/* 4. ROOM MESSAGES / CHAT */}
              <button
                onClick={() => setChatOpen(true)}
                className="relative flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/90 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 transition-all active:scale-95 shrink-0 whitespace-nowrap shadow-sm"
                title="Open Room Messages & Banter"
              >
                <MessageSquare className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Messages</span>
                {unreadChatCount > 0 && (
                  <span className="px-1 py-0.2 rounded-full bg-rose-500 text-white font-mono text-[9px] font-black animate-pulse shadow-sm">
                    {unreadChatCount}
                  </span>
                )}
              </button>

              {/* 5. BID HISTORY BUTTON */}
              <button
                onClick={() => setBidHistoryModalOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/90 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 transition-all active:scale-95 shrink-0 whitespace-nowrap"
                title="View live bidding log"
              >
                <Activity className="w-3 h-3 text-amber-400 shrink-0" />
                <span>History</span>
                {currentBids.length > 0 && (
                  <span className="px-1 py-0.2 rounded bg-slate-900 text-amber-400 font-mono text-[9px] font-black">
                    {currentBids.length}
                  </span>
                )}
              </button>

              {/* 6. SQUADS DRAWER BUTTON (Vertically small) */}
              <button
                onClick={() => setSquadsDrawerOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 transition-all active:scale-95 shrink-0 whitespace-nowrap"
                title="View all 10 franchise squads and purse breakdown"
              >
                <Users className="w-3 h-3 text-amber-400 shrink-0" />
                <span>Squads</span>
              </button>

              {/* 7. PURSE RADAR & MAX BID HUD BUTTON */}
              <button
                onClick={() => setRadarModalOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 text-[11px] font-bold text-cyan-300 border border-cyan-500/40 transition-all active:scale-95 shrink-0 whitespace-nowrap shadow-sm"
                title="Open Live Franchise Purse Radar & Max Safe Bid Strategy"
              >
                <Radar className="w-3 h-3 text-cyan-400 shrink-0" />
                <span>Radar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 py-2 sm:py-3.5">
        {/* Round Completed Intermission Notice Banner */}
        {roundCompletedNotice && (
          <div className="mb-2.5 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-600/30 via-orange-600/25 to-yellow-600/20 border-2 border-amber-500/60 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-3">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                <Trophy className="w-5 h-5 text-amber-300 animate-pulse" />
              </span>
              <div>
                <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
                  <span>🏁 Round {roundCompletedNotice.round} Complete</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black font-mono">
                    {roundCompletedNotice.unsoldAvailable} Unsold Returning
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-medium mt-0.5">
                  {roundCompletedNotice.message}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              {isHost && (
                <button
                  onClick={() => socketService.startAcceleratedRound(roomId, 15)}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <Zap className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Start Accelerated Now</span>
                </button>
              )}
              <button
                onClick={() => useAuctionStore.getState().dismissRoundCompletedNotice()}
                className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
                title="Dismiss"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Accelerated Round Live Notice Banner */}
        {acceleratedNotice && (
          <div className="mb-2.5 p-2 sm:p-2.5 rounded-xl bg-gradient-to-r from-orange-600/30 via-amber-600/20 to-orange-600/30 border border-orange-500/60 shadow-lg flex items-center justify-between gap-2 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-orange-500/20 text-orange-400 shrink-0">
                <Zap className="w-3.5 h-3.5 fill-orange-400 animate-bounce" />
              </span>
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-orange-300 flex items-center gap-1.5">
                  <span>⚡ Accelerated Blitz Round {acceleratedNotice.round} Underway!</span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-orange-500 text-slate-950 font-bold font-mono">
                    {acceleratedNotice.timerSeconds}s BLITZ
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 font-medium">
                  {acceleratedNotice.message}
                </p>
              </div>
            </div>
            <button
              onClick={() => useAuctionStore.getState().dismissAcceleratedNotice()}
              className="p-1 rounded-md bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
              title="Dismiss"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {room.status === 'COMPLETED' && (
          <div className="mb-3 p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-rose-500/20 border-2 border-amber-500/50 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-3 text-center sm:text-left min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl shrink-0">
                🏆
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black text-amber-300 uppercase tracking-wide">
                  Auction Concluded &amp; Squads Finalized
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  The host has ended the auction. All player contracts and purse balances have been sealed.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 w-full md:w-auto shrink-0">
              <button
                onClick={() => setSquadPosterTeam(myTeam || room.teams[0] || null)}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs uppercase tracking-wider shadow-md transition-transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                <span>Squad Poster</span>
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById('franchise-purses-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-md transition-transform hover:scale-105 active:scale-95 shrink-0 whitespace-nowrap"
              >
                Inspect All Squads
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-colors shrink-0 whitespace-nowrap"
              >
                Return Home
              </button>
            </div>
          </div>
        )}

        {/* 1) TOP SECTION (SIDE-BY-SIDE):
            Left: Player Profile (Photo in jersey, Name, Styles, Base price)
            Right: Amount Bidding (Timer, Bid button, Jump +25L, Jump +50L, Custom bid, Franchise purse) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 mb-3.5">
          <div className="lg:col-span-6 flex flex-col">
            <PlayerProfileCard auctionPlayer={currentAuctionPlayer} />
          </div>

          <div className="lg:col-span-6 flex flex-col">
            <LiveBiddingStage />
          </div>
        </div>

        {/* 2) MIDDLE SECTION: Player Career Formats Card (IPL, T20, ODI, TEST) */}
        {currentAuctionPlayer && (
          <div className="mb-3.5">
            <PlayerCareerFormatsCard auctionPlayer={currentAuctionPlayer} />
          </div>
        )}

        {/* 3) BOTTOM SECTION: Franchise Purses and Squads */}
        <div className="mb-3.5">
          <FranchiseLeaderboard />
        </div>
      </main>

      <FloatingAuctionBar />
      <RoomChatDrawer roomId={roomId} />
      <HostControls />
      <SoldCelebrationModal />
      <SquadInspectionDrawer
        isOpen={squadsDrawerOpen}
        onClose={() => setSquadsDrawerOpen(false)}
        initialSelectedTeamId={selectedDrawerTeam?.id}
      />
      <AuctionPoolRecordsModal
        isOpen={recordsModalOpen}
        onClose={() => setRecordsModalOpen(false)}
        initialTab={recordsModalTab}
      />
      <BidHistoryModal
        isOpen={bidHistoryModalOpen}
        onClose={() => setBidHistoryModalOpen(false)}
      />
      <PurseRadarModal
        isOpen={radarModalOpen}
        onClose={() => setRadarModalOpen(false)}
      />
      <SquadPosterModal
        isOpen={!!squadPosterTeam}
        onClose={() => setSquadPosterTeam(null)}
        team={squadPosterTeam}
      />
    </div>
  );
}
