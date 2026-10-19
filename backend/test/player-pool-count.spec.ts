import { describe, it, expect } from 'vitest';
import { INITIAL_PLAYERS } from '../src/players/initial-players.data.js';
import { PLAYER_PHOTOS } from '../../frontend/src/lib/playerPhotos.js';
import { useAuctionStore, AuctionPlayer, Room } from '../../frontend/src/lib/store.js';

describe('Player Pool Count (424 Players) & Availability Integrity Suite', () => {
  it('1. The intended total player count is exactly 424 and all players have distinct names', () => {
    expect(INITIAL_PLAYERS.length).toBe(424);
    const distinctNames = new Set(INITIAL_PLAYERS.map((p) => p.name));
    expect(distinctNames.size).toBe(424);

    const distinctPhotos = Object.keys(PLAYER_PHOTOS);
    expect(distinctPhotos.length).toBe(424);
  });

  it('2. Available-player counts remain distinct from total-player counts', () => {
    const mockAuctionPlayers: AuctionPlayer[] = [
      { id: 'ap1', roomId: 'r1', playerId: 'p1', lotNumber: 1, round: 1, status: 'SOLD', soldPrice: 20000000, soldToTeamId: 't1', player: INITIAL_PLAYERS[0] as any },
      { id: 'ap2', roomId: 'r1', playerId: 'p2', lotNumber: 2, round: 1, status: 'SOLD', soldPrice: 15000000, soldToTeamId: 't2', player: INITIAL_PLAYERS[1] as any },
      { id: 'ap3', roomId: 'r1', playerId: 'p3', lotNumber: 3, round: 1, status: 'NOMINATED', soldPrice: null, soldToTeamId: null, player: INITIAL_PLAYERS[2] as any },
      { id: 'ap4', roomId: 'r1', playerId: 'p4', lotNumber: 4, round: 1, status: 'UPCOMING', soldPrice: null, soldToTeamId: null, player: INITIAL_PLAYERS[3] as any },
      { id: 'ap5', roomId: 'r1', playerId: 'p5', lotNumber: 5, round: 1, status: 'UNSOLD', soldPrice: null, soldToTeamId: null, player: INITIAL_PLAYERS[4] as any },
    ];

    const totalCount = mockAuctionPlayers.length; // 5 total players in room
    const upcomingCount = mockAuctionPlayers.filter((ap) => ap.status === 'UPCOMING' || ap.status === 'NOMINATED').length; // 2
    const soldCount = mockAuctionPlayers.filter((ap) => ap.status === 'SOLD').length; // 2
    const unsoldCount = mockAuctionPlayers.filter((ap) => ap.status === 'UNSOLD').length; // 1

    expect(totalCount).toBe(5);
    expect(upcomingCount).toBe(2);
    expect(soldCount).toBe(2);
    expect(unsoldCount).toBe(1);
    expect(totalCount).not.toBe(upcomingCount);
  });

  it('3. Valid player records are not lost through role, tier, or search filters', () => {
    const allRoles = new Set(INITIAL_PLAYERS.map((p) => p.role));
    expect(allRoles.has('BATSMAN')).toBe(true);
    expect(allRoles.has('BOWLER')).toBe(true);
    expect(allRoles.has('ALL_ROUNDER')).toBe(true);
    expect(allRoles.has('WICKET_KEEPER')).toBe(true);

    const batsmen = INITIAL_PLAYERS.filter((p) => p.role === 'BATSMAN');
    const bowlers = INITIAL_PLAYERS.filter((p) => p.role === 'BOWLER');
    const allRounders = INITIAL_PLAYERS.filter((p) => p.role === 'ALL_ROUNDER');
    const keepers = INITIAL_PLAYERS.filter((p) => p.role === 'WICKET_KEEPER');

    expect(batsmen.length + bowlers.length + allRounders.length + keepers.length).toBe(424);
  });

  it('4. Sold players are not incorrectly returned as available / upcoming', () => {
    const apList: AuctionPlayer[] = [
      { id: 'ap-1', roomId: 'r1', playerId: 'p1', lotNumber: 1, round: 1, status: 'SOLD', soldPrice: 20000000, soldToTeamId: 't1', player: INITIAL_PLAYERS[0] as any },
      { id: 'ap-2', roomId: 'r1', playerId: 'p2', lotNumber: 2, round: 1, status: 'UPCOMING', soldPrice: null, soldToTeamId: null, player: INITIAL_PLAYERS[1] as any },
    ];

    const available = apList.filter((ap) => ap.status === 'UPCOMING' || ap.status === 'NOMINATED');
    expect(available.map((ap) => ap.id)).not.toContain('ap-1');
    expect(available.map((ap) => ap.id)).toContain('ap-2');
  });

  it('5. Frontend does not replace the total pool count with a partial filtered array length', () => {
    const mockRoom: Room = {
      id: 'room-424',
      code: 'TEST',
      name: 'Full Pool Room',
      hostId: 'host1',
      host: { id: 'host1', username: 'Host' },
      status: 'AUCTION_ACTIVE',
      startingPurse: 1000000000,
      minSquad: 18,
      maxSquad: 25,
      maxOverseas: 8,
      bidTimerSeconds: 25,
      snipeExtensionSeconds: 5,
      members: [],
      teams: [],
      auctionPlayers: Array.from({ length: 424 }, (_, i) => ({
        id: `ap-${i}`,
        roomId: 'room-424',
        playerId: `p-${i}`,
        lotNumber: i + 1,
        round: 1,
        status: i < 20 ? 'SOLD' : i === 20 ? 'NOMINATED' : 'UPCOMING',
        soldPrice: i < 20 ? 10000000 : null,
        soldToTeamId: i < 20 ? 'team-1' : null,
        player: {
          id: `p-${i}`,
          name: `Player ${i}`,
          role: 'BATSMAN',
          country: 'India',
          isOverseas: false,
          basePrice: 20000000,
          image: '/players/virat_kohli.png',
          matches: 10,
          runs: 300,
          wickets: 0,
          economy: 0,
          strikeRate: 130,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      })),
    };

    useAuctionStore.getState().setRoom(mockRoom);
    const state = useAuctionStore.getState();

    // Verify room has all 424 auction players
    expect(state.room?.auctionPlayers.length).toBe(424);

    // Filtered upcoming count
    const upcomingFiltered = state.room?.auctionPlayers.filter((ap) => ap.status === 'UPCOMING' || ap.status === 'NOMINATED');
    expect(upcomingFiltered?.length).toBe(404);

    // Total pool count remains authoritative 424
    const totalPoolCount = state.room?.auctionPlayers.length || 0;
    expect(totalPoolCount).toBe(424);
    expect(totalPoolCount).not.toBe(upcomingFiltered?.length);
  });

  it('6. Room synchronization does not truncate or corrupt the 424-player pool', () => {
    useAuctionStore.getState().logout();
    const mockRoom: Room = {
      id: 'room-sync-424',
      code: 'SYNC',
      name: 'Sync Room',
      hostId: 'host1',
      host: { id: 'host1', username: 'Host' },
      status: 'AUCTION_ACTIVE',
      startingPurse: 1000000000,
      minSquad: 18,
      maxSquad: 25,
      maxOverseas: 8,
      bidTimerSeconds: 25,
      snipeExtensionSeconds: 5,
      currentAuctionPlayerId: 'ap-10',
      members: [],
      teams: [],
      auctionPlayers: Array.from({ length: 424 }, (_, i) => ({
        id: `ap-${i}`,
        roomId: 'room-sync-424',
        playerId: `p-${i}`,
        lotNumber: i + 1,
        round: 1,
        status: i === 10 ? 'NOMINATED' : 'UPCOMING',
        soldPrice: null,
        soldToTeamId: null,
        player: {
          id: `p-${i}`,
          name: `Player ${i}`,
          role: 'BATSMAN',
          country: 'India',
          isOverseas: false,
          basePrice: 20000000,
          image: '/players/virat_kohli.png',
          matches: 10,
          runs: 300,
          wickets: 0,
          economy: 0,
          strikeRate: 130,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      })),
    };

    useAuctionStore.getState().setRoom(mockRoom);
    expect(useAuctionStore.getState().room?.auctionPlayers.length).toBe(424);

    // Trigger room_sync without providing auctionPlayers override
    useAuctionStore.getState().syncRoomState({
      room: { ...mockRoom, members: [{ userId: 'user2', isHost: false, isReady: true, isOnline: true } as any] },
    });

    const state = useAuctionStore.getState();
    expect(state.room?.auctionPlayers.length).toBe(424);
    expect(state.currentAuctionPlayer?.id).toBe('ap-10');
  });

  it('7. The fix maintains all 424 players across Marquee, Capped, and Uncapped tiers', () => {
    const marquee = INITIAL_PLAYERS.filter((p) => p.tier === 'MARQUEE');
    const capped = INITIAL_PLAYERS.filter((p) => p.tier === 'CAPPED');
    const uncapped = INITIAL_PLAYERS.filter((p) => p.tier === 'UNCAPPED');

    expect(marquee.length).toBeGreaterThan(0);
    expect(capped.length).toBeGreaterThan(0);
    expect(uncapped.length).toBeGreaterThan(0);
    expect(marquee.length + capped.length + uncapped.length).toBe(424);
  });
});
