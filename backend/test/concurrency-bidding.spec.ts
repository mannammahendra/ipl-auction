import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:4000';

describe('Concurrency & Rapid Bidding Stress Integration Tests', () => {
  let hostToken = '';
  let manager1Token = '';
  let manager2Token = '';
  let roomId = '';
  let roomCode = '';
  let team1Id = '';
  let team2Id = '';

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
    const hRes = await fetch(`${BASE_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'ConcurrentHost' }),
    });
    const hData = await hRes.json();
    hostToken = hData.token;

    // 2. Authenticate Manager 1
    const m1Res = await fetch(`${BASE_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'BidderDC' }),
    });
    const m1Data = await m1Res.json();
    manager1Token = m1Data.token;

    // 3. Authenticate Manager 2
    const m2Res = await fetch(`${BASE_URL}/api/auth/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'BidderMI' }),
    });
    const m2Data = await m2Res.json();
    manager2Token = m2Data.token;

    // 4. Create Room (Host gets auto-assigned to teams[0])
    const roomRes = await fetch(`${BASE_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostToken}`,
      },
      body: JSON.stringify({
        name: 'Stress Testing Arena',
        password: 'stressSecret123',
        startingPurse: 1000000000, // 100 Cr
        minSquad: 11,
        maxSquad: 18,
        maxOverseas: 4,
        bidTimerSeconds: 15,
      }),
    });
    const roomData = await roomRes.json();
    roomId = roomData.id;
    roomCode = roomData.code;
    
    // Assign teams[1] to Manager 1, and teams[2] to Manager 2
    team1Id = roomData.teams[1].id;
    team2Id = roomData.teams[2].id;

    // 5. Managers join room
    await fetch(`${BASE_URL}/api/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager1Token}` },
      body: JSON.stringify({ code: roomCode, password: 'stressSecret123' }),
    });
    await fetch(`${BASE_URL}/api/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager2Token}` },
      body: JSON.stringify({ code: roomCode, password: 'stressSecret123' }),
    });

    // 6. Select non-overlapping teams
    const sel1 = await fetch(`${BASE_URL}/api/rooms/${roomId}/select-team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager1Token}` },
      body: JSON.stringify({ teamId: team1Id, managerName: 'DC Manager' }),
    });
    expect(sel1.status).toBe(201);

    const sel2 = await fetch(`${BASE_URL}/api/rooms/${roomId}/select-team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager2Token}` },
      body: JSON.stringify({ teamId: team2Id, managerName: 'MI Manager' }),
    });
    expect(sel2.status).toBe(201);

    // 7. Start auction
    const startRes = await fetch(`${BASE_URL}/api/auction/${roomId}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
    });
    expect(startRes.status).toBe(201);
  });

  beforeEach((ctx) => {
    if (!isServerRunning) {
      ctx.skip();
    }
  });

  it('verifies that self-outbidding is strictly prevented', async () => {
    // Manager 1 places opening bid (2 Cr)
    const bid1Res = await fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager1Token}` },
      body: JSON.stringify({ teamId: team1Id, amount: 20000000 }),
    });
    expect(bid1Res.status).toBe(201);

    // Manager 1 tries to immediately bid again while already holding the highest bid
    const bidSelfRes = await fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager1Token}` },
      body: JSON.stringify({ teamId: team1Id, amount: 22000000 }),
    });
    expect([400, 403]).toContain(bidSelfRes.status);
    const selfJson = await bidSelfRes.json();
    expect(selfJson.message).toMatch(/already holds the highest bid/i);
  });

  it('handles rapid alternate bidding cleanly with BCCI increments', async () => {
    // Current highest is Team 1 at 2 Cr. Next valid bid is 2.20 Cr (20L increment in 2-5 Cr slab).
    // Manager 2 bids 2.20 Cr
    const bid2 = await fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager2Token}` },
      body: JSON.stringify({ teamId: team2Id, amount: 22000000 }),
    });
    expect(bid2.status).toBe(201);
    const data2 = await bid2.json();
    expect(data2.bid.amount).toBe(22000000);
    expect(data2.bid.teamId).toBe(team2Id);

    // Manager 1 bids next: 2.40 Cr
    const bid3 = await fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager1Token}` },
      body: JSON.stringify({ teamId: team1Id, amount: 24000000 }),
    });
    expect(bid3.status).toBe(201);
    const data3 = await bid3.json();
    expect(data3.bid.amount).toBe(24000000);
    expect(data3.bid.teamId).toBe(team1Id);

    // Manager 2 bids next: 2.60 Cr
    const bid4 = await fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager2Token}` },
      body: JSON.stringify({ teamId: team2Id, amount: 26000000 }),
    });
    expect(bid4.status).toBe(201);
    const data4 = await bid4.json();
    expect(data4.bid.amount).toBe(26000000);
    expect(data4.bid.teamId).toBe(team2Id);
  });

  it('serializes simultaneous concurrent bids via acquireLock without state corruption', async () => {
    // Current leader is Team 2 at 2.60 Cr.
    // Both Manager 1 and Manager 2 fire bids concurrently
    const [res1, res2] = await Promise.all([
      fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager1Token}` },
        body: JSON.stringify({ teamId: team1Id }),
      }),
      fetch(`${BASE_URL}/api/auction/${roomId}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${manager2Token}` },
        body: JSON.stringify({ teamId: team2Id }),
      }),
    ]);

    // Because acquireLock processes requests sequentially in FIFO order:
    // First bid to arrive will be from Manager 1 (Team 1), bidding 2.80 Cr -> succeeds (201).
    // Second bid to arrive will be from Manager 2 (Team 2), bidding 3.00 Cr -> succeeds (201).
    // Neither crashes, neither corrupts state, and both bids are valid BCCI increments.
    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const b1 = await res1.json();
    const b2 = await res2.json();

    // Verify sequential increment progression: 2.80 Cr and 3.00 Cr
    expect(b1.bid.amount).toBe(28000000);
    expect(b2.bid.amount).toBe(30000000);

    // Verify room state is consistent and current bid is exactly 3.00 Cr held by Team 2
    const finalRoomRes = await fetch(`${BASE_URL}/api/rooms/${roomId}`, {
      headers: { Authorization: `Bearer ${hostToken}` },
    });
    const finalRoom = await finalRoomRes.json();
    expect(finalRoom.currentBidAmount).toBe(30000000);
    expect(finalRoom.currentBidTeamId).toBe(team2Id);
  });
});

