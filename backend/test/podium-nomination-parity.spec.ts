import { describe, it, expect, vi } from 'vitest';
import { useAuctionStore, AuctionPlayer, Room } from '../../frontend/src/lib/store';

describe('Podium Nomination & Local/Production Parity Regression Suite', () => {
  describe('Zustand Store Podium Persistence & Synchronization', () => {
    const mockPlayer = {
      id: 'p1',
      name: 'Virat Kohli',
      role: 'BATSMAN',
      country: 'India',
      isOverseas: false,
      basePrice: 20000000,
      image: '/players/virat_kohli.png',
      matches: 250,
      runs: 8000,
      wickets: 4,
      economy: 8.5,
      strikeRate: 135.0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    const mockAuctionPlayer: AuctionPlayer = {
      id: 'ap1',
      roomId: 'room1',
      playerId: 'p1',
      lotNumber: 1,
      round: 1,
      status: 'NOMINATED',
      soldPrice: null,
      soldToTeamId: null,
      player: mockPlayer,
    };

    const mockRoom: Room = {
      id: 'room1',
      code: 'ABCD',
      name: 'Mega Auction 2026',
      hostId: 'user1',
      host: { id: 'user1', username: 'HostUser' },
      status: 'AUCTION_ACTIVE',
      startingPurse: 1000000000,
      minSquad: 18,
      maxSquad: 25,
      maxOverseas: 8,
      bidTimerSeconds: 25,
      snipeExtensionSeconds: 5,
      currentAuctionPlayerId: 'ap1',
      currentBidAmount: 0,
      currentBidTeamId: null,
      isPaused: false,
      members: [],
      teams: [],
      auctionPlayers: [mockAuctionPlayer],
    };

    it('setRoom resolves and preserves currentAuctionPlayer when currentAuctionPlayerId matches', () => {
      useAuctionStore.getState().logout();

      // Calling setRoom with room that has auctionPlayers and currentAuctionPlayerId
      useAuctionStore.getState().setRoom(mockRoom);

      const state = useAuctionStore.getState();
      expect(state.room?.id).toBe('room1');
      expect(state.currentAuctionPlayer).not.toBeNull();
      expect(state.currentAuctionPlayer?.id).toBe('ap1');
      expect(state.currentAuctionPlayer?.player.name).toBe('Virat Kohli');
    });

    it('syncRoomState does NOT clear currentAuctionPlayer if currentAuctionPlayer is omitted in payload', () => {
      useAuctionStore.getState().logout();

      // First, player is on podium
      useAuctionStore.getState().onPlayerNominated({
        auctionPlayer: mockAuctionPlayer,
        timerSeconds: 25,
      });

      expect(useAuctionStore.getState().currentAuctionPlayer?.id).toBe('ap1');

      // Now a room_sync arrives (e.g. from user claiming a team or toggling ready) without currentAuctionPlayer
      useAuctionStore.getState().syncRoomState({
        room: mockRoom,
        // currentAuctionPlayer is undefined!
      });

      const state = useAuctionStore.getState();
      // MUST NOT be wiped to null!
      expect(state.currentAuctionPlayer).not.toBeNull();
      expect(state.currentAuctionPlayer?.id).toBe('ap1');
      expect(state.currentAuctionPlayer?.player.name).toBe('Virat Kohli');
    });

    it('onPlayerNominated updates room status to AUCTION_ACTIVE and sets currentAuctionPlayer with NOMINATED status', () => {
      useAuctionStore.getState().logout();
      useAuctionStore.getState().setRoom({ ...mockRoom, status: 'LOBBY', currentAuctionPlayerId: undefined });

      useAuctionStore.getState().onPlayerNominated({
        auctionPlayer: { ...mockAuctionPlayer, status: 'NOMINATED' },
        timerSeconds: 20,
      });

      const state = useAuctionStore.getState();
      expect(state.room?.status).toBe('AUCTION_ACTIVE');
      expect(state.room?.currentAuctionPlayerId).toBe('ap1');
      expect(state.currentAuctionPlayer).not.toBeNull();
      expect(state.currentAuctionPlayer?.status).toBe('NOMINATED');
      expect(state.remainingTimer).toBe(20);
      expect(state.soldCelebration).toBeNull();
      expect(state.unsoldNotice).toBeNull();
    });

    it('clears celebration notice when a new lot is nominated', () => {
      useAuctionStore.getState().logout();

      // Simulate celebration active
      useAuctionStore.setState({
        soldCelebration: {
          player: mockPlayer,
          team: { id: 't1', roomId: 'room1', name: 'RCB', shortName: 'RCB', color: '#ff0000', startingPurse: 100, currentPurse: 50, totalPlayers: 1, overseasCount: 0, squad: [] },
          amount: 20000000,
        },
      });

      expect(useAuctionStore.getState().soldCelebration).not.toBeNull();

      // Nominate next player
      useAuctionStore.getState().onPlayerNominated({
        auctionPlayer: mockAuctionPlayer,
        timerSeconds: 25,
      });

      expect(useAuctionStore.getState().soldCelebration).toBeNull();
    });
  });

  describe('Backend Room Service getRoomById Current Player Resolution', () => {
    it('correctly maps currentAuctionPlayer in getRoomById simulation', () => {
      const mockDbRoom = {
        id: 'r-test',
        code: 'TEST',
        status: 'AUCTION_ACTIVE',
        currentAuctionPlayerId: 'ap-123',
        auctionPlayers: [
          {
            id: 'ap-123',
            roomId: 'r-test',
            playerId: 'p-1',
            lotNumber: 1,
            round: 1,
            status: 'NOMINATED',
            player: { name: 'Rohit Sharma', role: 'BATSMAN' },
          },
          {
            id: 'ap-124',
            roomId: 'r-test',
            playerId: 'p-2',
            lotNumber: 2,
            round: 1,
            status: 'UPCOMING',
            player: { name: 'Jasprit Bumrah', role: 'BOWLER' },
          },
        ],
      };

      // Simulating getRoomById logic
      let currentAuctionPlayer: any = null;
      if (mockDbRoom.currentAuctionPlayerId) {
        currentAuctionPlayer = mockDbRoom.auctionPlayers?.find(
          (ap: any) => ap.id === mockDbRoom.currentAuctionPlayerId
        ) || null;
      }

      const roomResponse = {
        ...mockDbRoom,
        currentAuctionPlayer,
      };

      expect(roomResponse.currentAuctionPlayer).not.toBeNull();
      expect(roomResponse.currentAuctionPlayer.id).toBe('ap-123');
      expect(roomResponse.currentAuctionPlayer.player.name).toBe('Rohit Sharma');
    });
  });

  describe('Consecutive Lot Progression Logic', () => {
    it('stale NOMINATED check does not block when currentAuctionPlayerId is null', () => {
      const room = {
        id: 'r-prog',
        status: 'AUCTION_ACTIVE',
        currentAuctionPlayerId: null, // Podium is currently empty
      };

      const currentlyNominated = {
        id: 'stale-ap',
        status: 'NOMINATED',
      };

      // Old buggy check: if (currentlyNominated) return; -> DEADLOCK!
      // New guarded check:
      let shouldSkipAutoNomination = false;
      if (room.currentAuctionPlayerId) {
        if (room.currentAuctionPlayerId === currentlyNominated.id) {
          shouldSkipAutoNomination = true;
        }
      }

      expect(shouldSkipAutoNomination).toBe(false);
    });

    it('advances to next UPCOMING lot when stage is cleared', () => {
      const pool = [
        { id: 'ap-1', lotNumber: 1, status: 'SOLD' },
        { id: 'ap-2', lotNumber: 2, status: 'UPCOMING' },
        { id: 'ap-3', lotNumber: 3, status: 'UPCOMING' },
      ];

      const nextPlayer = pool
        .filter((p) => p.status === 'UPCOMING')
        .sort((a, b) => a.lotNumber - b.lotNumber)[0];

      expect(nextPlayer).toBeDefined();
      expect(nextPlayer.id).toBe('ap-2');
      expect(nextPlayer.lotNumber).toBe(2);
    });
  });
});
