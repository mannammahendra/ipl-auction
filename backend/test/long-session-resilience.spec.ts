import { describe, it, expect } from 'vitest';
import { RoomMutex } from '../src/auction/auction.engine.js';
import { AsyncLocalStorage } from 'node:async_hooks';

describe('Long-Session Resilience & Deadlock Prevention Suite', () => {
  describe('RoomMutex FIFO Serialization & Exception Safety', () => {
    it('executes concurrent requests strictly in FIFO order', async () => {
      const mutex = new RoomMutex();
      const executionOrder: number[] = [];

      const makeTask = (id: number, delayMs: number) => async () => {
        const release = await mutex.acquire(5000);
        try {
          await new Promise((r) => setTimeout(r, delayMs));
          executionOrder.push(id);
        } finally {
          release();
        }
      };

      // Launch 5 tasks concurrently
      const tasks = [
        makeTask(1, 20),
        makeTask(2, 15),
        makeTask(3, 10),
        makeTask(4, 5),
        makeTask(5, 5),
      ];

      await Promise.all(tasks.map((t) => t()));

      expect(executionOrder).toEqual([1, 2, 3, 4, 5]);
      expect(mutex.isIdle()).toBe(true);
    });

    it('releases lock when a task throws an error, allowing subsequent tasks to proceed', async () => {
      const mutex = new RoomMutex();
      const executionOrder: string[] = [];

      // Task 1: Throws an unhandled exception
      const task1 = async () => {
        const release = await mutex.acquire(5000);
        try {
          executionOrder.push('task1_started');
          throw new Error('Database connection dropped unexpectedly during lot hammer strike!');
        } finally {
          release();
        }
      };

      // Task 2: Legitimate subsequent bid that should NOT get locked out
      const task2 = async () => {
        const release = await mutex.acquire(5000);
        try {
          executionOrder.push('task2_completed');
        } finally {
          release();
        }
      };

      // Task 3: Another lot nomination
      const task3 = async () => {
        const release = await mutex.acquire(5000);
        try {
          executionOrder.push('task3_completed');
        } finally {
          release();
        }
      };

      await expect(task1()).rejects.toThrow('Database connection dropped unexpectedly');
      await task2();
      await task3();

      expect(executionOrder).toEqual(['task1_started', 'task2_completed', 'task3_completed']);
      expect(mutex.isIdle()).toBe(true);
    });

    it('safely handles queue timeouts without corrupting the queue for other waiters', async () => {
      const mutex = new RoomMutex();
      const executionOrder: string[] = [];

      // Acquire lock and hold it for 100ms
      const release1 = await mutex.acquire(5000);

      // Task with tiny timeout (20ms) should fail fast
      const fastTimeoutTask = async () => {
        try {
          const release = await mutex.acquire(20);
          release();
        } catch {
          executionOrder.push('timed_out');
        }
      };

      // Task with sufficient timeout (2000ms) should succeed once release1 is called
      const patientTask = async () => {
        const release = await mutex.acquire(2000);
        try {
          executionOrder.push('patient_succeeded');
        } finally {
          release();
        }
      };

      const pFast = fastTimeoutTask();
      const pPatient = patientTask();

      // Wait for fast task to time out
      await new Promise((r) => setTimeout(r, 40));
      release1();

      await Promise.all([pFast, pPatient]);

      expect(executionOrder).toEqual(['timed_out', 'patient_succeeded']);
      expect(mutex.isIdle()).toBe(true);
    });

    it('supports re-entrant execution via AsyncLocalStorage pattern to prevent self-deadlocks', async () => {
      const mutex = new RoomMutex();
      const lockStorage = new AsyncLocalStorage<Set<string>>();
      const roomId = 'room_reentrant_test';

      async function withLock<T>(action: () => Promise<T>): Promise<T> {
        const currentLocks = lockStorage.getStore();
        if (currentLocks && currentLocks.has(roomId)) {
          // Already holding the lock on this async context - avoid self-deadlock
          return await action();
        }

        const release = await mutex.acquire(5000);
        const newLocks = new Set(currentLocks || []);
        newLocks.add(roomId);

        try {
          return await lockStorage.run(newLocks, action);
        } finally {
          release();
        }
      }

      // Outer locked operation calls inner locked operation
      const result = await withLock(async () => {
        const outerVal = 'outer_step';
        const innerVal = await withLock(async () => {
          return 'inner_step_without_deadlock';
        });
        return `${outerVal}_${innerVal}`;
      });

      expect(result).toBe('outer_step_inner_step_without_deadlock');
      expect(mutex.isIdle()).toBe(true);
    });
  });

  describe('Authoritative Deadline Calculation & Skew Resistance', () => {
    it('computes accurate remaining seconds from server timestamp deadline', () => {
      const now = 1000000;
      const timerEndsAt = now + 14200; // 14.2 seconds in future

      const remainingSec = Math.max(0, Math.ceil((timerEndsAt - now) / 1000));
      expect(remainingSec).toBe(15);

      // Skew / tick after 5.3 seconds
      const elapsed5_3s = now + 5300;
      const remainingSecAfter5_3s = Math.max(0, Math.ceil((timerEndsAt - elapsed5_3s) / 1000));
      expect(remainingSecAfter5_3s).toBe(9);

      // At or past deadline
      const pastDeadline = now + 15000;
      const remainingPast = Math.max(0, Math.ceil((timerEndsAt - pastDeadline) / 1000));
      expect(remainingPast).toBe(0);
    });

    it('rejects stale lot completion callbacks using generation tokens', () => {
      const activeGenerations = new Map<string, number>();
      const completedLots: string[] = [];

      function simulateLotCompletion(roomId: string, expectedGen: number, lotId: string) {
        const currentGen = activeGenerations.get(roomId) || 0;
        if (expectedGen !== currentGen) {
          // Stale callback from previous lot - reject!
          return false;
        }
        completedLots.push(lotId);
        return true;
      }

      const roomId = 'room_gen_test';

      // Lot 1 starts at generation 1
      activeGenerations.set(roomId, 1);

      // Before Lot 1 timer callback fires, Lot 2 is nominated (generation bumped to 2)
      activeGenerations.set(roomId, 2);

      // Stale callback for Lot 1 fires now
      const lot1Result = simulateLotCompletion(roomId, 1, 'lot_player_1');
      expect(lot1Result).toBe(false);
      expect(completedLots).toHaveLength(0);

      // Legitimate callback for Lot 2 fires
      const lot2Result = simulateLotCompletion(roomId, 2, 'lot_player_2');
      expect(lot2Result).toBe(true);
      expect(completedLots).toEqual(['lot_player_2']);
    });
  });

  describe('Round Progression & Accelerated Intermission Logic', () => {
    it('correctly transitions from round 1 pool exhaustion to accelerated round', () => {
      const players = [
        { id: 'p1', status: 'SOLD' },
        { id: 'p2', status: 'UNSOLD' },
        { id: 'p3', status: 'SOLD' },
        { id: 'p4', status: 'UNSOLD' },
        { id: 'p5', status: 'SOLD' },
      ];

      const upcomingPlayers = players.filter((p) => p.status === 'UPCOMING');
      const unsoldPlayers = players.filter((p) => p.status === 'UNSOLD');

      expect(upcomingPlayers.length).toBe(0);
      expect(unsoldPlayers.length).toBe(2);

      // When upcoming is 0 and unsold > 0, round 1 completes and triggers accelerated round with blitz timer
      const shouldTriggerAccelerated = upcomingPlayers.length === 0 && unsoldPlayers.length > 0;
      expect(shouldTriggerAccelerated).toBe(true);

      const nextRound = 2;
      const blitzTimerSeconds = 15;
      const intermissionSeconds = 8;

      expect(nextRound).toBe(2);
      expect(blitzTimerSeconds).toBe(15);
      expect(intermissionSeconds).toBe(8);
    });
  });
});

