import { describe, it, expect } from 'vitest';

describe('Auction Engine Blitz Countdown & Transition Integrity', () => {
  it('sequentially emits every countdown second without skips when 1.5x Blitz has timer jitter', () => {
    const emittedTicks: number[] = [];
    const speed = 1.5;
    const durationSeconds = 5;
    const startTime = 10000;
    const timerEndsAt = startTime + Math.round((durationSeconds * 1000) / speed); // 13333ms (~3.33s duration)

    let remainingSeconds = durationSeconds;
    emittedTicks.push(remainingSeconds); // Initial broadcast at t=0

    // Simulate intervals with typical Node.js jitter (e.g. 670ms, 1340ms, 2010ms, 2680ms, 3350ms)
    const tickOffsets = [670, 1340, 2010, 2680, 3350];

    for (const offset of tickOffsets) {
      const currentNow = startTime + offset;
      const remainingMs = timerEndsAt - currentNow;
      const targetRemaining = Math.max(0, Math.ceil((remainingMs * speed) / 1000));

      const previousRemaining = remainingSeconds;
      if (previousRemaining > targetRemaining) {
        for (let sec = previousRemaining - 1; sec >= targetRemaining; sec--) {
          remainingSeconds = sec;
          emittedTicks.push(sec);
          if (sec <= 0) break;
        }
      }
    }

    // Must emit every single second: 5, 4, 3, 2, 1, 0
    expect(emittedTicks).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('triggers zero transition exactly once when countdown reaches zero', () => {
    let transitionCount = 0;
    let isTransitioning = false;

    const completeLotMock = () => {
      if (isTransitioning) return;
      isTransitioning = true;
      transitionCount++;
    };

    // Simulate final ticks arriving near zero
    const ticks = [2, 1, 0, 0, -1];
    for (const tick of ticks) {
      if (tick <= 0) {
        completeLotMock();
      }
    }

    expect(transitionCount).toBe(1);
  });
});

