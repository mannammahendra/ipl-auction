import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetSpeedDto, NominatePlayerDto } from '../src/auction/dto/auction-action.dto.js';

// Voice formatting helper pure functions matching frontend/src/lib/voice.ts
function formatRupeesSpoken(amount: number): string {
  if (!amount || amount <= 0) return '0';
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    if (cr % 1 === 0) {
      return `${cr} Crore`;
    }
    const cleanCr = parseFloat(cr.toFixed(2));
    return `${cleanCr} Crore`;
  }
  if (amount >= 100000) {
    const lakhs = Math.round(amount / 100000);
    return `${lakhs} Lakh`;
  }
  return `${amount} rupees`;
}

function normalizeTeamShort(rawName?: string): string {
  if (!rawName) return 'Bidder';
  const clean = rawName.toUpperCase().trim();
  if (['CSK', 'MI', 'RCB', 'KKR', 'SRH', 'RR', 'GT', 'LSG', 'DC', 'PBKS'].includes(clean)) {
    return clean;
  }
  if (clean.includes('CHENNAI') || clean.includes('SUPER KINGS')) return 'CSK';
  if (clean.includes('MUMBAI') || clean.includes('INDIANS')) return 'MI';
  if (clean.includes('BENGALURU') || clean.includes('BANGALORE') || clean.includes('CHALLENGERS')) return 'RCB';
  if (clean.includes('KOLKATA') || clean.includes('KNIGHT')) return 'KKR';
  if (clean.includes('HYDERABAD') || clean.includes('SUNRISERS')) return 'SRH';
  if (clean.includes('RAJASTHAN') || clean.includes('ROYALS')) return 'RR';
  if (clean.includes('GUJARAT') || clean.includes('TITANS')) return 'GT';
  if (clean.includes('LUCKNOW') || clean.includes('GIANTS')) return 'LSG';
  if (clean.includes('DELHI') || clean.includes('CAPITALS')) return 'DC';
  if (clean.includes('PUNJAB') || clean.includes('KINGS')) return 'PBKS';
  return clean;
}

function calculateMaxSafeBid(
  currentPurse: number,
  currentSquadSize: number,
  minSquadRequired: number,
  minBasePrice: number = 2000000
): { maxSafeBid: number; slotsNeeded: number; reserveNeeded: number; isEligible: boolean } {
  const slotsNeeded = Math.max(0, minSquadRequired - currentSquadSize);
  if (slotsNeeded <= 0) {
    return {
      maxSafeBid: currentPurse,
      slotsNeeded: 0,
      reserveNeeded: 0,
      isEligible: true,
    };
  }
  const reserveNeeded = Math.max(0, slotsNeeded - 1) * minBasePrice;
  const maxSafeBid = Math.max(0, currentPurse - reserveNeeded);
  const isEligible = maxSafeBid >= minBasePrice;
  return { maxSafeBid, slotsNeeded, reserveNeeded, isEligible };
}

describe('Voice & Audio Formatting Test Suite', () => {
  describe('formatRupeesSpoken', () => {
    it('converts integer Crores correctly (e.g. 20000000 -> 2 Crore)', () => {
      expect(formatRupeesSpoken(20000000)).toBe('2 Crore');
      expect(formatRupeesSpoken(100000000)).toBe('10 Crore');
      expect(formatRupeesSpoken(247500000)).toBe('24.75 Crore');
    });

    it('converts Lakhs correctly (e.g. 5000000 -> 50 Lakh, 2000000 -> 20 Lakh)', () => {
      expect(formatRupeesSpoken(5000000)).toBe('50 Lakh');
      expect(formatRupeesSpoken(2000000)).toBe('20 Lakh');
      expect(formatRupeesSpoken(7500000)).toBe('75 Lakh');
    });

    it('converts sub-lakh values to rupees', () => {
      expect(formatRupeesSpoken(50000)).toBe('50000 rupees');
      expect(formatRupeesSpoken(0)).toBe('0');
    });
  });

  describe('normalizeTeamShort', () => {
    it('normalizes full franchise names to official 3-letter codes', () => {
      expect(normalizeTeamShort('Chennai Super Kings')).toBe('CSK');
      expect(normalizeTeamShort('Mumbai Indians')).toBe('MI');
      expect(normalizeTeamShort('Royal Challengers Bengaluru')).toBe('RCB');
      expect(normalizeTeamShort('Kolkata Knight Riders')).toBe('KKR');
      expect(normalizeTeamShort('Sunrisers Hyderabad')).toBe('SRH');
      expect(normalizeTeamShort('Rajasthan Royals')).toBe('RR');
      expect(normalizeTeamShort('Gujarat Titans')).toBe('GT');
      expect(normalizeTeamShort('Lucknow Super Giants')).toBe('LSG');
      expect(normalizeTeamShort('Delhi Capitals')).toBe('DC');
      expect(normalizeTeamShort('Punjab Kings')).toBe('PBKS');
    });

    it('retains valid short codes unchanged', () => {
      expect(normalizeTeamShort('CSK')).toBe('CSK');
      expect(normalizeTeamShort('mi')).toBe('MI');
    });
  });
});

describe('Purse Radar & Max Safe Bid Calculations', () => {
  it('reserves adequate purse for remaining required squad slots', () => {
    // 100 Cr purse, currently 15 players, min 18 required (needs 3 more)
    // Needs 2 reserved at 20L = 40 Lakhs reserve
    const res = calculateMaxSafeBid(1000000000, 15, 18, 2000000);
    expect(res.slotsNeeded).toBe(3);
    expect(res.reserveNeeded).toBe(4000000); // 40 Lakhs
    expect(res.maxSafeBid).toBe(996000000); // 99.60 Crore
    expect(res.isEligible).toBe(true);
  });

  it('allows full remaining purse when squad is within 1 player of completion', () => {
    // 10 Cr purse, currently 17 players, min 18 required (needs 1 more)
    // 0 reserved needed for other slots
    const res = calculateMaxSafeBid(100000000, 17, 18, 2000000);
    expect(res.slotsNeeded).toBe(1);
    expect(res.reserveNeeded).toBe(0);
    expect(res.maxSafeBid).toBe(100000000);
    expect(res.isEligible).toBe(true);
  });

  it('marks team ineligible if purse is lower than min reserve', () => {
    // 30 Lakhs purse, needs 3 players (reserve needed = 40L)
    const res = calculateMaxSafeBid(3000000, 15, 18, 2000000);
    expect(res.maxSafeBid).toBe(0);
    expect(res.isEligible).toBe(false);
  });
});

describe('Auction Controls DTO Validation', () => {
  it('validates SetSpeedDto within safe limits', async () => {
    const valid1 = plainToInstance(SetSpeedDto, { speedMultiplier: 1.0 });
    const valid2 = plainToInstance(SetSpeedDto, { speedMultiplier: 1.25 });
    const valid3 = plainToInstance(SetSpeedDto, { speedMultiplier: 1.5 });

    expect((await validate(valid1)).length).toBe(0);
    expect((await validate(valid2)).length).toBe(0);
    expect((await validate(valid3)).length).toBe(0);

    // 2.0x Blitz is completely removed and invalid
    const invalid2x = plainToInstance(SetSpeedDto, { speedMultiplier: 2.0 });
    const errors2x = await validate(invalid2x);
    expect(errors2x.length).toBeGreaterThan(0);

    const invalidLow = plainToInstance(SetSpeedDto, { speedMultiplier: 0.1 });
    const errorsLow = await validate(invalidLow);
    expect(errorsLow.length).toBeGreaterThan(0);

    const invalidHigh = plainToInstance(SetSpeedDto, { speedMultiplier: 10.0 });
    const errorsHigh = await validate(invalidHigh);
    expect(errorsHigh.length).toBeGreaterThan(0);
  });

  it('validates NominatePlayerDto requiring valid player id', async () => {
    const valid = plainToInstance(NominatePlayerDto, { auctionPlayerId: 'player-virat-18' });
    expect((await validate(valid)).length).toBe(0);

    const empty = plainToInstance(NominatePlayerDto, { auctionPlayerId: '' });
    expect((await validate(empty)).length).toBeGreaterThan(0);
  });
});

