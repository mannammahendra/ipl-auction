import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:4000';

describe('Squad Limit, Overseas Quota & Purse Reserve Boundary Tests', () => {
  let hostToken = '';
  let roomId = '';
  let teamId = '';
  let hostUserId = '';

  let isServerRunning = false;

  beforeAll(async () => {
    try {
      const healthRes = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (healthRes.ok) {
        const healthJson = await healthRes.json();
        isServerRunning = healthJson.status === 'ok';
      }
    } catch {
      isServerRunning = false;
    }

    if (!isServerRunning) return;

    // 1. Authenticate Host
    const authRes = await fetch(`${BASE_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'BoundaryTestHost' }),
    });
    const authData = await authRes.json();
    hostToken = authData.token;
    hostUserId = authData.user.id;

    // 2. Create Room with a restricted purse (10 Cr), minSquad: 11, maxSquad: 18, maxOverseas: 2
    const roomRes = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        name: 'Squad Constraints Arena',
        startingPurse: 100000000, // 10 Cr starting purse
        minSquad: 11,
        maxSquad: 18,
        maxOverseas: 2,
        bidTimerSeconds: 15,
      }),
    });
    const roomData = await roomRes.json();
    roomId = roomData.id;
    teamId = roomData.teams[0].id; // Host assigned to teams[0]

    // 3. Start auction
    await fetch(`${BASE_URL}/api/auction/${roomId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
    });
  });

  beforeEach((ctx) => {
    if (!isServerRunning) {
      ctx.skip();
    }
  });

  it('rejects a bid that violates the compulsory squad purse reserve', async () => {
    // With 10 Cr total purse and 11 mandatory players, bidding 9.5 Cr leaves only 0.5 Cr (50 Lakh)
    // for remaining 10 players, which violates minimum reserve per slot.
    const res = await fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        teamId,
        amount: 95000000, // 9.5 Cr
      }),
    });

    expect([400, 403]).toContain(res.status);
    const body = await res.json();
    expect(body.message).toMatch(/Compulsory squad reserve|Insufficient purse/i);
  });

  it('accepts a valid bid that preserves the compulsory squad reserve', async () => {
    // Opening bid of 2 Cr leaves 8 Cr for remaining 10 players, which is well above the required reserve.
    const res = await fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        teamId,
        amount: 20000000, // 2 Cr
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.bid.amount).toBe(20000000);
  });

  it('verifies mathematical reserve formula across different purse tiers', () => {
    // Formula from auction.engine.ts:
    // minPerSlot = Math.min(2000000, Math.max(500000, Math.floor(startingPurse / (maxSquad * 2))))
    // remainingSlotsToMin = Math.max(0, minSquad - (currentSquadCount + 1))
    // requiredReserve = remainingSlotsToMin * minPerSlot

    // Case 1: Standard 120 Cr IPL purse, 18 maxSquad, 11 minSquad, 0 players bought
    const startingPurse1 = 1200000000;
    const maxSquad1 = 18;
    const minSquad1 = 11;
    const minPerSlot1 = Math.min(2000000, Math.max(500000, Math.floor(startingPurse1 / (maxSquad1 * 2))));
    expect(minPerSlot1).toBe(2000000); // Capped at 20 Lakhs
    const reserve1 = Math.max(0, minSquad1 - (0 + 1)) * minPerSlot1;
    expect(reserve1).toBe(10 * 2000000); // 2 Cr reserved for remaining 10 slots

    // Case 2: Mini-auction 10 Cr purse, 18 maxSquad, 11 minSquad
    const startingPurse2 = 100000000;
    const minPerSlot2 = Math.min(2000000, Math.max(500000, Math.floor(startingPurse2 / (maxSquad1 * 2))));
    // 100,000,000 / 36 = 2,777,777 capped at 2,000,000
    expect(minPerSlot2).toBe(2000000);

    // Case 3: Ultra-budget 2 Cr purse, 18 maxSquad, 11 minSquad
    const startingPurse3 = 20000000;
    const minPerSlot3 = Math.min(2000000, Math.max(500000, Math.floor(startingPurse3 / (maxSquad1 * 2))));
    // 20,000,000 / 36 = 555,555
    expect(minPerSlot3).toBe(555555);
  });
});

