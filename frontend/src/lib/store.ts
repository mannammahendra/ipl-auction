import { create } from 'zustand';
import { soundFx } from './audio';

export interface User {
  id: string;
  username: string;
  email?: string;
  isGuest?: boolean;
  avatar?: string;
}

export interface PlayerStats {
  matches?: number;
  runs?: number;
  wickets?: number;
  avg?: number;
  strikeRate?: number;
  economy?: number;
  bbi?: string;
  hundreds?: number;
  fifties?: number;
}

export interface Player {
  id: string;
  name: string;
  country: string;
  isOverseas: boolean;
  role: 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKET_KEEPER';
  battingStyle?: string;
  bowlingStyle?: string;
  tier: string;
  basePrice: number;
  image?: string;
  stats?: string;
}

export interface AuctionPlayer {
  id: string;
  roomId: string;
  playerId: string;
  player: Player;
  status: 'UPCOMING' | 'NOMINATED' | 'SOLD' | 'UNSOLD' | 'PASSED';
  lotNumber: number;
  soldPrice?: number;
  soldToTeamId?: string;
  round?: number;
}

export interface SquadMember {
  id: string;
  teamId: string;
  playerId: string;
  auctionPlayerId?: string;
  player: Player;
  purchasePrice: number;
  purchasedAt?: string;
  createdAt?: string;
}

export interface Team {
  id: string;
  roomId: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  logo?: string;
  initialPurse: number;
  currentPurse: number;
  totalPlayers: number;
  overseasCount: number;
  members?: any[];
  squad?: SquadMember[];
}

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  user: User;
  teamId?: string;
  team?: Team;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  hostId: string;
  host: User;
  status: 'LOBBY' | 'CONFIGURING' | 'AUCTION_ACTIVE' | 'PAUSED' | 'COMPLETED';
  startingPurse: number;
  minSquad: number;
  maxSquad: number;
  maxOverseas: number;
  bidTimerSeconds: number;
  snipeExtensionSeconds: number;
  currentRound?: number;
  currentAuctionPlayerId?: string;
  currentBidAmount?: number;
  currentBidTeamId?: string;
  isPaused: boolean;
  members: RoomMember[];
  teams: Team[];
  auctionPlayers: AuctionPlayer[];
}

export interface BidRecord {
  id: string;
  amount: number;
  bidNumber: number;
  team: Team;
  bidder: { id: string; username: string };
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  avatar?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  teamShortName?: string | null;
  teamColor?: string | null;
  teamLogo?: string | null;
  text: string;
  timestamp: number;
}

export interface VoiceParticipant {
  userId: string;
  socketId: string;
  username: string;
  teamShortName?: string | null;
  teamColor?: string | null;
  isMuted: boolean;
  isSpeaking: boolean;
}

interface AuctionStore {
  user: User | null;
  token: string | null;
  room: Room | null;
  currentAuctionPlayer: AuctionPlayer | null;
  currentBidAmount: number;
  currentBidTeamId: string | null;
  currentBidTeam: Team | null;
  currentBidderName: string | null;
  currentBids: BidRecord[];
  remainingTimer: number;
  isTimerPaused: boolean;
  soundEnabled: boolean;
  soldCelebration: { player: Player; team: Team; amount: number } | null;
  unsoldNotice: { player: Player } | null;
  lastError: string | null;

  // Real-time Chat
  messages: ChatMessage[];
  unreadChatCount: number;
  chatOpen: boolean;

  // Real-time Voice / Microphone
  voiceParticipants: VoiceParticipant[];
  isVoiceConnected: boolean;
  isMicMuted: boolean;
  isSpeaking: boolean;

  // Accelerated Round
  isAccelerated: boolean;
  acceleratedNotice: { message: string; round: number; timerSeconds: number } | null;
  roundCompletedNotice: { round: number; unsoldAvailable: number; message: string; intermissionSeconds: number } | null;

  // Auction Speed / Blitz Multiplier
  speedMultiplier: number;
  setSpeedMultiplier: (speedMultiplier: number) => void;

  setUser: (user: User | null, token: string | null) => void;
  logout: () => void;
  setRoom: (room: Room) => void;
  setTimer: (seconds: number, isPaused?: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setLastError: (err: string | null) => void;

  // Chat Actions
  setChatOpen: (open: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  markChatRead: () => void;

  // Voice Actions
  setVoiceConnected: (connected: boolean) => void;
  setMicMuted: (muted: boolean) => void;
  setIsSpeaking: (speaking: boolean) => void;
  setVoiceParticipants: (participants: VoiceParticipant[]) => void;
  addVoiceParticipant: (participant: VoiceParticipant) => void;
  removeVoiceParticipant: (socketId: string) => void;
  updateVoiceParticipantState: (socketId: string, state: { isMuted?: boolean; isSpeaking?: boolean }) => void;

  // Accelerated Actions
  onRoundCompleted: (payload: { round: number; unsoldAvailable: number; message: string; intermissionSeconds: number }) => void;
  dismissRoundCompletedNotice: () => void;
  onAcceleratedRoundStarted: (payload: { round: number; timerSeconds: number; recalledCount: number; message: string }) => void;
  onPlayerRecalled: (payload: { auctionPlayer: AuctionPlayer; recalledBy: string; message: string }) => void;
  dismissAcceleratedNotice: () => void;

  syncRoomState: (payload: {
    room: Room;
    currentAuctionPlayer?: AuctionPlayer | null;
    currentBids?: BidRecord[];
    timerState?: { remainingSeconds: number; isPaused: boolean; speedMultiplier?: number } | null;
    recentMessages?: ChatMessage[];
    voiceParticipants?: VoiceParticipant[];
  }) => void;

  onBidPlaced: (payload: { bid: BidRecord; team: Team; amount: number; timerSeconds: number }) => void;
  onPlayerNominated: (payload: { auctionPlayer: AuctionPlayer; timerSeconds: number }) => void;
  onPlayerSold: (payload: { auctionPlayer: AuctionPlayer; winningTeam: Team; soldPrice: number; squadMember?: SquadMember }) => void;
  onPlayerUnsold: (payload: { auctionPlayer: AuctionPlayer }) => void;
  dismissCelebration: () => void;
}

export const useAuctionStore = create<AuctionStore>((set) => ({
  user: null,
  token: null,
  room: null,
  currentAuctionPlayer: null,
  currentBidAmount: 0,
  currentBidTeamId: null,
  currentBidTeam: null,
  currentBidderName: null,
  currentBids: [],
  remainingTimer: 25,
  isTimerPaused: false,
  soundEnabled: true,
  soldCelebration: null,
  unsoldNotice: null,
  lastError: null,

  // Accelerated Round
  isAccelerated: false,
  acceleratedNotice: null,
  roundCompletedNotice: null,

  // Auction Speed / Blitz Multiplier
  speedMultiplier: 1.0,
  setSpeedMultiplier: (speedMultiplier) => set({ speedMultiplier }),

  // Real-time Chat
  messages: [],
  unreadChatCount: 0,
  chatOpen: false,

  // Real-time Voice / Microphone
  voiceParticipants: [],
  isVoiceConnected: false,
  isMicMuted: true,
  isSpeaking: false,

  setUser: (user, token) => set({ user, token }),

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ipl_auction_token');
      localStorage.removeItem('ipl_auction_user');
    }
    set({ user: null, token: null, room: null });
  },

  setRoom: (room) =>
    set((state) => ({
      room,
      remainingTimer: state.currentAuctionPlayer ? state.remainingTimer : (room?.bidTimerSeconds || 25),
    })),

  setTimer: (remainingTimer, isTimerPaused) =>
    set((state) => ({
      remainingTimer,
      isTimerPaused: isTimerPaused !== undefined ? isTimerPaused : state.isTimerPaused,
    })),

  setSoundEnabled: (enabled) => {
    soundFx.enabled = enabled;
    set({ soundEnabled: enabled });
  },

  setLastError: (lastError) => set({ lastError }),

  setChatOpen: (chatOpen) =>
    set((state) => ({ chatOpen, unreadChatCount: chatOpen ? 0 : state.unreadChatCount })),

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, msg],
      unreadChatCount: state.chatOpen ? 0 : state.unreadChatCount + 1,
    })),

  setMessages: (messages) => set({ messages }),

  markChatRead: () => set({ unreadChatCount: 0 }),

  setVoiceConnected: (isVoiceConnected) => set({ isVoiceConnected }),
  setMicMuted: (isMicMuted) => set({ isMicMuted }),
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  setVoiceParticipants: (voiceParticipants) => set({ voiceParticipants }),
  addVoiceParticipant: (participant) =>
    set((state) => ({
      voiceParticipants: [
        ...state.voiceParticipants.filter((p) => p.socketId !== participant.socketId),
        participant,
      ],
    })),
  removeVoiceParticipant: (socketId) =>
    set((state) => ({
      voiceParticipants: state.voiceParticipants.filter((p) => p.socketId !== socketId),
    })),
  updateVoiceParticipantState: (socketId, update) =>
    set((state) => ({
      voiceParticipants: state.voiceParticipants.map((p) =>
        p.socketId === socketId ? { ...p, ...update } : p,
      ),
    })),

  syncRoomState: ({ room, currentAuctionPlayer, currentBids, timerState, recentMessages, voiceParticipants }) => {
    const currentTeam = room.teams?.find((t) => t.id === room.currentBidTeamId) || null;
    const latestBidder = currentBids && currentBids.length > 0 ? currentBids[0].bidder?.username : null;
    set((state) => ({
      room,
      currentAuctionPlayer: currentAuctionPlayer || null,
      currentBidAmount: room.currentBidAmount || 0,
      currentBidTeamId: room.currentBidTeamId || null,
      currentBidTeam: currentTeam,
      currentBidderName: latestBidder,
      currentBids: currentBids || [],
      remainingTimer: timerState ? timerState.remainingSeconds : (room.bidTimerSeconds || 25),
      isTimerPaused: timerState ? timerState.isPaused : room.isPaused,
      speedMultiplier: timerState?.speedMultiplier || state.speedMultiplier || 1.0,
      messages: recentMessages !== undefined ? recentMessages : state.messages,
      voiceParticipants: voiceParticipants !== undefined ? voiceParticipants : state.voiceParticipants,
      isAccelerated: (room.currentRound || 1) >= 2 || (room.bidTimerSeconds || 25) <= 15,
    }));
  },

  onBidPlaced: ({ bid, team, amount, timerSeconds }) => {
    soundFx.playBidChime();

    set((state) => {
      const updatedBids = [bid, ...state.currentBids.filter((b) => b.id !== bid.id)];
      const bidderName = bid.bidder?.username || (team as any).user?.username || null;
      return {
        currentBidAmount: amount,
        currentBidTeamId: team.id,
        currentBidTeam: team,
        currentBidderName: bidderName,
        currentBids: updatedBids,
        remainingTimer: timerSeconds,
        soldCelebration: null,
        unsoldNotice: null,
      };
    });
  },

  onPlayerNominated: ({ auctionPlayer, timerSeconds }) => {
    set((state) => {
      const updatedAuctionPlayers = state.room?.auctionPlayers
        ? state.room.auctionPlayers.map((ap) =>
            ap.id === auctionPlayer.id ? { ...ap, status: 'NOMINATED' as const } : ap,
          )
        : [];
      const updatedRoom = state.room ? { ...state.room, auctionPlayers: updatedAuctionPlayers } : null;

      return {
        room: updatedRoom,
        currentAuctionPlayer: auctionPlayer,
        currentBidAmount: 0,
        currentBidTeamId: null,
        currentBidTeam: null,
        currentBidderName: null,
        currentBids: [],
        remainingTimer: timerSeconds,
        soldCelebration: null,
        unsoldNotice: null,
        roundCompletedNotice: null,
      };
    });
  },

  onPlayerSold: ({ auctionPlayer, winningTeam, soldPrice, squadMember }) => {
    soundFx.playGavel();

    const memberToAdd: SquadMember = {
      ...(squadMember || {}),
      id: squadMember?.id || `squad_${auctionPlayer.id}`,
      teamId: winningTeam.id,
      playerId: auctionPlayer.playerId,
      auctionPlayerId: auctionPlayer.id,
      purchasePrice: soldPrice,
      player: (squadMember as any)?.player || auctionPlayer.player,
      createdAt: (squadMember as any)?.createdAt || new Date().toISOString(),
    };

    set((state) => {
      const updatedTeams = state.room
        ? state.room.teams.map((t) => {
            if (t.id === winningTeam.id) {
              const currentSquad = t.squad || [];
              const exists = currentSquad.some(
                (m) => m.playerId === auctionPlayer.playerId || m.auctionPlayerId === auctionPlayer.id
              );
              if (exists) {
                return t;
              }
              const nextSquad = [...currentSquad, memberToAdd];
              return {
                ...t,
                currentPurse: t.currentPurse - soldPrice,
                totalPlayers: nextSquad.length,
                overseasCount: auctionPlayer.player.isOverseas ? t.overseasCount + 1 : t.overseasCount,
                squad: nextSquad,
              };
            }
            return t;
          })
        : [];

      const updatedAuctionPlayers = state.room?.auctionPlayers
        ? state.room.auctionPlayers.map((ap) => {
            if (ap.id === auctionPlayer.id) {
              return {
                ...ap,
                status: 'SOLD' as const,
                soldPrice,
                soldToTeamId: winningTeam.id,
              };
            }
            return ap;
          })
        : [];

      const updatedRoom = state.room
        ? { ...state.room, teams: updatedTeams, auctionPlayers: updatedAuctionPlayers }
        : null;

      return {
        room: updatedRoom,
        currentAuctionPlayer: {
          ...auctionPlayer,
          status: 'SOLD' as const,
          soldPrice,
          soldToTeamId: winningTeam.id,
        },
        soldCelebration: {
          player: auctionPlayer.player,
          team: winningTeam,
          amount: soldPrice,
        },
      };
    });
  },

  onPlayerUnsold: ({ auctionPlayer }) => {
    // All sounds when player was unsold removed as requested
    set((state) => {
      const updatedAuctionPlayers = state.room?.auctionPlayers
        ? state.room.auctionPlayers.map((ap) =>
            ap.id === auctionPlayer.id ? { ...ap, status: 'UNSOLD' as const } : ap,
          )
        : [];
      const updatedRoom = state.room ? { ...state.room, auctionPlayers: updatedAuctionPlayers } : null;

      return {
        room: updatedRoom,
        currentAuctionPlayer: {
          ...auctionPlayer,
          status: 'UNSOLD' as const,
        },
        unsoldNotice: { player: auctionPlayer.player },
        currentBidAmount: 0,
        currentBidTeamId: null,
        currentBidTeam: null,
      };
    });
  },

  onRoundCompleted: (payload) => {
    set({
      roundCompletedNotice: payload,
      currentAuctionPlayer: null,
      currentBidAmount: 0,
      currentBidTeamId: null,
      currentBidTeam: null,
      currentBidderName: null,
      currentBids: [],
    });
  },

  dismissRoundCompletedNotice: () => set({ roundCompletedNotice: null }),

  onAcceleratedRoundStarted: ({ round, timerSeconds, message }) => {
    set((state) => ({
      isAccelerated: true,
      roundCompletedNotice: null,
      remainingTimer: timerSeconds,
      acceleratedNotice: { message, round, timerSeconds },
      room: state.room ? { ...state.room, currentRound: round, bidTimerSeconds: timerSeconds } : null,
    }));
  },

  onPlayerRecalled: ({ auctionPlayer, message }) => {
    set((state) => {
      const updatedAuctionPlayers = state.room?.auctionPlayers
        ? state.room.auctionPlayers.map((ap) =>
            ap.id === auctionPlayer.id ? { ...ap, status: 'UPCOMING' as const, round: auctionPlayer.round } : ap,
          )
        : [];
      return {
        room: state.room ? { ...state.room, auctionPlayers: updatedAuctionPlayers } : null,
        acceleratedNotice: { message, round: auctionPlayer.round || 2, timerSeconds: state.room?.bidTimerSeconds || 15 },
      };
    });
  },

  dismissAcceleratedNotice: () => set({ acceleratedNotice: null }),

  dismissCelebration: () => set({ soldCelebration: null, unsoldNotice: null }),
}));
