import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SetSpeedDto, NominatePlayerDto } from '../src/auction/dto/auction-action.dto.js';

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

describe('Host Controls & Safe Bid Calculation Suite', () => {
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
});

