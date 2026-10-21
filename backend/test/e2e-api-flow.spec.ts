import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:4000';

describe('Live API & Auction Engine Integration E2E Flow', () => {
  let authToken = '';
  let hostUserId = '';
  let roomId = '';
  let roomCode = '';
  let firstTeamId = '';
  let nominatedPlayerId = '';

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
  });

  beforeEach((ctx) => {
    if (!isServerRunning) {
      ctx.skip();
    }
  });

  it('Step 1: Authenticates as a guest manager', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'TestHost' }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(data.user).toBeDefined();
    expect(data.user.username).toContain('TestHost');

    authToken = data.token;
    hostUserId = data.user.id;
  });

  it('Step 2: Creates an auction room with BCCI starting purse and rules', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'Wankhede Test Arena',
        startingPurse: 1200000000, // 120 Cr
        minSquad: 11,
        maxSquad: 18,
        maxOverseas: 4,
        bidTimerSeconds: 15,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.code).toBeDefined();
    expect(data.status).toBe('LOBBY');
    expect(data.teams.length).toBe(10); // 10 official IPL franchises initialized

    roomId = data.id;
    roomCode = data.code;
    firstTeamId = data.teams[0].id;
  });

  it('Step 3: Host claims a franchise (e.g. CSK)', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/select-team`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        teamId: firstTeamId,
        managerName: 'Dhoni_Host',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    const updatedMember = data.members.find((m: any) => m.userId === hostUserId);
    expect(updatedMember).toBeDefined();
    expect(updatedMember.teamId).toBe(firstTeamId);
  });

  it('Step 4: Host updates auction lobby settings dynamically', async () => {
    const res = await fetch(`${BASE_URL}/api/rooms/${roomId}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        bidTimerSeconds: 14,
        squadSize: 11,
        maxOverseas: 4,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.bidTimerSeconds).toBe(14);
  });

  it('Step 5: Host starts the auction', async () => {
    const res = await fetch(`${BASE_URL}/api/auction/${roomId}/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify room state is active and first player nominated
    const roomRes = await fetch(`${BASE_URL}/api/rooms/${roomId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const roomData = await roomRes.json();
    expect(roomData.status).toBe('AUCTION_ACTIVE');
    expect(roomData.currentAuctionPlayerId).toBeDefined();
    nominatedPlayerId = roomData.currentAuctionPlayerId;
  });

  it('Step 6: Host pauses the auction', async () => {
    const res = await fetch(`${BASE_URL}/api/auction/${roomId}/pause`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.paused).toBe(true);
  });

  it('Step 7: Host resumes the auction', async () => {
    const res = await fetch(`${BASE_URL}/api/auction/${roomId}/resume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.resumed).toBe(true);
  });

  it('Step 8: Host changes Blitz auction speed', async () => {
    const res = await fetch(`${BASE_URL}/api/auction/${roomId}/speed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ speedMultiplier: 1.5 }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.speedMultiplier).toBe(1.5);
  });

  it('Step 9: Places a valid opening bid for the nominated player', async () => {
    // Current bid is 0, base price opening bid
    const res = await fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        teamId: firstTeamId,
        amount: 20000000, // 2 Cr opening bid
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.bid).toBeDefined();
    expect(data.bid.teamId).toBe(firstTeamId);
  });

  it('Step 10: Non-host user cannot execute host actions (Authorization security)', async () => {
    // Create regular guest user
    const guestRes = await fetch(`${BASE_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'UnprivilegedPlayer' }),
    });
    const guestData = await guestRes.json();
    const guestToken = guestData.token;

    // Join room as regular member
    await fetch(`${BASE_URL}/api/rooms/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${guestToken}`,
      },
      body: JSON.stringify({ code: roomCode }),
    });

    // Try pausing room as non-host -> should be rejected with 400/403
    const unauthorizedPause = await fetch(`${BASE_URL}/api/auction/${roomId}/pause`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestToken}` },
    });
    expect([400, 403]).toContain(unauthorizedPause.status);

    // Try skipping player as non-host -> should be rejected
    const unauthorizedSkip = await fetch(`${BASE_URL}/api/auction/${roomId}/skip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guestToken}` },
    });
    expect([400, 403]).toContain(unauthorizedSkip.status);
  });
});
