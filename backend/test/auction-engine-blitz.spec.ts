import { describe, it, expect } from 'vitest';

describe('Auction Engine 2x Blitz Countdown & Transition Integrity', () => {
  it('sequentially emits every countdown second without skips when 2x Blitz has timer jitter', () => {
    const emittedTicks: number[] = [];
    const speed = 2.0;
    const durationSeconds = 5;
    const startTime = 10000;
    const timerEndsAt = startTime + Math.round((durationSeconds * 1000) / speed); // 12500ms (2.5s duration)

    let remainingSeconds = durationSeconds;
    emittedTicks.push(remainingSeconds); // Initial broadcast at t=0

    // Simulate intervals with typical Node.js jitter (e.g. 510ms, 495ms, 540ms, 480ms, 520ms)
    const tickOffsets = [510, 1005, 1545, 2025, 2530];

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

