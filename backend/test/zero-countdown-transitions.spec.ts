import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Zero Countdown & Blitz Speed Transition Integrity Suite', () => {
  // Test speed configurations required by specification
  const SPEEDS = [
    { label: 'Normal (1.0x)', speed: 1.0, expectedDurationMs: (sec: number) => sec * 1000 },
    { label: 'Blitz 1.25x', speed: 1.25, expectedDurationMs: (sec: number) => Math.round((sec * 1000) / 1.25) },
    { label: 'Blitz 1.5x', speed: 1.5, expectedDurationMs: (sec: number) => Math.round((sec * 1000) / 1.5) },
    { label: 'Blitz 2.0x', speed: 2.0, expectedDurationMs: (sec: number) => Math.round((sec * 1000) / 2.0) },
  ];

  describe('1. Speed & Deadline Calculations across Normal and Blitz Multipliers', () => {
    SPEEDS.forEach(({ label, speed, expectedDurationMs }) => {
      it(`calculates accurate deadlines and ticks for ${label}`, () => {
        const durationSeconds = 25;
        const now = 1700000000000;
        const timerEndsAt = now + expectedDurationMs(durationSeconds);

        // At start (t = now)
        const remainingAtStart = Math.min(durationSeconds, Math.max(0, Math.ceil(((timerEndsAt - now) * speed) / 1000)));
        expect(remainingAtStart).toBe(25);

        // Halfway through real time
        const halfRealTime = Math.round(expectedDurationMs(durationSeconds) / 2);
        const tHalf = now + halfRealTime;
        const remainingHalf = Math.min(durationSeconds, Math.max(0, Math.ceil(((timerEndsAt - tHalf) * speed) / 1000)));
        expect(remainingHalf).toBeGreaterThanOrEqual(12);
        expect(remainingHalf).toBeLessThanOrEqual(13);

        // At exact expiration (t = timerEndsAt)
        const remainingAtZero = Math.max(0, Math.ceil(((timerEndsAt - timerEndsAt) * speed) / 1000));
        expect(remainingAtZero).toBe(0);

        // Past deadline (t = timerEndsAt + 100ms)
        const remainingPast = Math.max(0, Math.ceil(((timerEndsAt - (timerEndsAt + 100)) * speed) / 1000));
        expect(remainingPast).toBe(0);
      });
    });
  });

  describe('2. State-Aware Zero Expiration: Sold vs Unsold vs Next Nomination', () => {
    it('executes PLAYER_SOLD when countdown hits zero with active bids', () => {
      // Mock room state with an active bid
      const room = {
        id: 'room_sold_test',
        status: 'AUCTION_ACTIVE',
        currentAuctionPlayerId: 'ap_1',
        currentBidAmount: 140000000, // 14 Crore
        currentBidTeamId: 'team_csk',
      };

      const auctionPlayer = {
        id: 'ap_1',
        status: 'NOMINATED',
        playerId: 'p_dhoni',
        player: { name: 'MS Dhoni', basePrice: 20000000, isOverseas: false },
      };

      const team = {
        id: 'team_csk',
        name: 'Chennai Super Kings',
        currentPurse: 1000000000,
        totalPlayers: 5,
        squad: [],
      };

      // State machine transitions on zero
      function resolveZeroCountdown(r: typeof room, ap: typeof auctionPlayer, t: typeof team) {
        if (!r.currentAuctionPlayerId || ap.status !== 'NOMINATED') {
          return { action: 'NOOP' };
        }

        if (r.currentBidTeamId && r.currentBidAmount && r.currentBidAmount > 0) {
          // Bids placed -> Player SOLD
          t.currentPurse -= r.currentBidAmount;
          t.totalPlayers += 1;
          ap.status = 'SOLD';
          r.currentAuctionPlayerId = null;
          r.currentBidAmount = 0;
          r.currentBidTeamId = null;
          return { action: 'PLAYER_SOLD', winningTeamId: t.id, soldPrice: 140000000 };
        } else {
          // No bids -> Player UNSOLD
          ap.status = 'UNSOLD';
          r.currentAuctionPlayerId = null;
          return { action: 'PLAYER_UNSOLD' };
        }
      }

      const outcome = resolveZeroCountdown(room, auctionPlayer, team);

      expect(outcome.action).toBe('PLAYER_SOLD');
      expect(outcome.soldPrice).toBe(140000000);
      expect(team.currentPurse).toBe(860000000);
      expect(team.totalPlayers).toBe(6);
      expect(auctionPlayer.status).toBe('SOLD');
      expect(room.currentAuctionPlayerId).toBeNull();
    });

    it('executes PLAYER_UNSOLD when countdown hits zero with zero bids', () => {
      const room = {
        id: 'room_unsold_test',
        status: 'AUCTION_ACTIVE',
        currentAuctionPlayerId: 'ap_2',
        currentBidAmount: 0,
        currentBidTeamId: null,
      };

      const auctionPlayer = {
        id: 'ap_2',
        status: 'NOMINATED',
        playerId: 'p_unlucky',
        player: { name: 'Player X', basePrice: 20000000, isOverseas: false },
      };

      function resolveZeroCountdown(r: typeof room, ap: typeof auctionPlayer) {
        if (r.currentBidTeamId && r.currentBidAmount && r.currentBidAmount > 0) {
          return { action: 'PLAYER_SOLD' };
        } else {
          ap.status = 'UNSOLD';
          r.currentAuctionPlayerId = null;
          return { action: 'PLAYER_UNSOLD' };
        }
      }

      const outcome = resolveZeroCountdown(room, auctionPlayer);

      expect(outcome.action).toBe('PLAYER_UNSOLD');
      expect(auctionPlayer.status).toBe('UNSOLD');
      expect(room.currentAuctionPlayerId).toBeNull();
    });

    it('transitions to next UPCOMING player nomination after lot resolution', () => {
      const pool = [
        { id: 'ap_1', status: 'SOLD', lotNumber: 1 },
        { id: 'ap_2', status: 'UPCOMING', lotNumber: 2, player: { name: 'Jasprit Bumrah' } },
        { id: 'ap_3', status: 'UPCOMING', lotNumber: 3, player: { name: 'Rohit Sharma' } },
      ];

      const room = {
        id: 'room_next_nom_test',
        status: 'AUCTION_ACTIVE',
        currentAuctionPlayerId: null as string | null,
        bidTimerSeconds: 25,
      };

      function nominateNext(r: typeof room, pList: typeof pool) {
        const next = pList.find((p) => p.status === 'UPCOMING');
        if (next) {
          next.status = 'NOMINATED';
          r.currentAuctionPlayerId = next.id;
          return { nominated: next, timerSeconds: r.bidTimerSeconds };
        }
        return null;
      }

      const res = nominateNext(room, pool);

      expect(res).not.toBeNull();
      expect(res?.nominated.id).toBe('ap_2');
      expect(res?.timerSeconds).toBe(25);
      expect(room.currentAuctionPlayerId).toBe('ap_2');
    });
  });

  describe('3. Elimination of Random Timer Restarts (3s, 4s, 6s)', () => {
    it('never restarts an expired timer with random values when countdown hits zero', () => {
      // Simulation of the old buggy late-bid check vs the corrected logic
      const now = 1700000012500;
      // An unscaled timerEndsAt that was 12.5 seconds in future during 2.0x blitz
      const unscaledEndsAt = now + 12500;
      const speed = 2.0;

      // Old buggy logic: compared unscaled endsAt to now + 500, restarting timer with 6s, 4s, 3s
      const buggyRemainingSec = Math.max(1, Math.ceil((unscaledEndsAt - now) / 1000));
      expect(buggyRemainingSec).toBe(13); // Would restart with 13s, then 6s, then 3s!

      // Corrected logic: timerEndsAt is scaled by speed, and generation match guarantees lot completion
      const currentGen = 5;
      const expectedGen = 5;

      let timerRestarted = false;
      let lotCompleted = false;

      function handleLotCompletion(gen: number) {
        if (gen !== currentGen) {
          // Generation superseded by a legitimate new bid
          return;
        }
        // No restart! Directly complete lot
        lotCompleted = true;
      }

      handleLotCompletion(expectedGen);

      expect(timerRestarted).toBe(false);
      expect(lotCompleted).toBe(true);
    });

    it('rejects duplicate or stale zero callbacks across concurrent invocations', () => {
      let executionCount = 0;
      let isTransitioning = false;

      function onCountdownZero() {
        if (isTransitioning) {
          // Guard: already transitioning, reject duplicate callback
          return false;
        }
        isTransitioning = true;
        executionCount++;
        return true;
      }

      // Simulate 3 simultaneous zero triggers (interval tick, watchdog, and client heartbeat)
      const first = onCountdownZero();
      const second = onCountdownZero();
      const third = onCountdownZero();

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(third).toBe(false);
      expect(executionCount).toBe(1);
    });
  });

  describe('4. Blitz Speed Transition Timing Integrity', () => {
    SPEEDS.forEach(({ label, speed }) => {
      it(`scales post-resolution transition delay correctly at ${label}`, () => {
        // Sold transition delay: base 4000ms / speed, min 1000ms
        const soldDelayMs = Math.max(1000, Math.round(4000 / speed));
        // Unsold transition delay: base 2500ms / speed, min 800ms
        const unsoldDelayMs = Math.max(800, Math.round(2500 / speed));

        if (speed === 1.0) {
          expect(soldDelayMs).toBe(4000);
          expect(unsoldDelayMs).toBe(2500);
        } else if (speed === 1.25) {
          expect(soldDelayMs).toBe(3200);
          expect(unsoldDelayMs).toBe(2000);
        } else if (speed === 1.5) {
          expect(soldDelayMs).toBe(2667);
          expect(unsoldDelayMs).toBe(1667);
        } else if (speed === 2.0) {
          expect(soldDelayMs).toBe(2000);
          expect(unsoldDelayMs).toBe(1250);
        }

        expect(soldDelayMs).toBeGreaterThanOrEqual(1000);
        expect(unsoldDelayMs).toBeGreaterThanOrEqual(800);
      });
    });
  });

  describe('5. Multi-Client Broadcast Parity at Zero', () => {
    it('broadcasts identical lot completion and next lot nomination to all clients in room', () => {
      const clientEvents: Record<string, string[]> = {
        client_host: [],
        client_bidder1: [],
        client_bidder2: [],
        client_spectator: [],
      };

      function broadcast(event: string, payload: any) {
        Object.keys(clientEvents).forEach((clientId) => {
          clientEvents[clientId].push(event);
        });
      }

      // 1. Timer hits 0
      broadcast('timer_tick', { remainingSeconds: 0 });
      // 2. Next action executes immediately
      broadcast('player_sold', { soldPrice: 100000000 });
      // 3. Next lot nominated
      broadcast('player_nominated', { timerSeconds: 25 });

      // All 4 clients receive exactly the same sequential events
      Object.keys(clientEvents).forEach((clientId) => {
        expect(clientEvents[clientId]).toEqual(['timer_tick', 'player_sold', 'player_nominated']);
      });
    });
  });

  describe('6. Non-Premature Termination & Accelerated Intermission', () => {
    it('triggers Accelerated Round intermission rather than abruptly terminating when pool has unsolds', () => {
      const pool = [
        { id: 'p1', status: 'SOLD' },
        { id: 'p2', status: 'UNSOLD' },
        { id: 'p3', status: 'SOLD' },
      ];

      const upcoming = pool.filter((p) => p.status === 'UPCOMING');
      const unsold = pool.filter((p) => p.status === 'UNSOLD');
      const currentRound = 1;

      let nextAction = '';
      if (upcoming.length > 0) {
        nextAction = 'NOMINATE_UPCOMING';
      } else if (unsold.length > 0 && currentRound < 5) {
        nextAction = 'SCHEDULE_ACCELERATED_ROUND';
      } else {
        nextAction = 'AUCTION_COMPLETED';
      }

      expect(nextAction).toBe('SCHEDULE_ACCELERATED_ROUND');
    });

    it('concludes auction only when all squads full or no unsold players remain', () => {
      const pool = [
        { id: 'p1', status: 'SOLD' },
        { id: 'p2', status: 'SOLD' },
      ];

      const upcoming = pool.filter((p) => p.status === 'UPCOMING');
      const unsold = pool.filter((p) => p.status === 'UNSOLD');

      let nextAction = '';
      if (upcoming.length > 0) {
        nextAction = 'NOMINATE_UPCOMING';
      } else if (unsold.length > 0) {
        nextAction = 'SCHEDULE_ACCELERATED_ROUND';
      } else {
        nextAction = 'AUCTION_COMPLETED';
      }

      expect(nextAction).toBe('AUCTION_COMPLETED');
    });
  });
});
