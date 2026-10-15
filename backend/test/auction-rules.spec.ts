import { describe, it, expect } from 'vitest';
import { getAuctionIncrement, calculateNextValidBid } from '../src/constants/auctionRules.js';

describe('Auction Rules & Increment Calculations (BCCI Slabs)', () => {
  describe('getAuctionIncrement', () => {
    it('returns 5 Lakhs (500,000) for bids below 1 Crore', () => {
      expect(getAuctionIncrement(0)).toBe(500000);
      expect(getAuctionIncrement(2000000)).toBe(500000); // 20L
      expect(getAuctionIncrement(5000000)).toBe(500000); // 50L
      expect(getAuctionIncrement(9500000)).toBe(500000); // 95L
    });

    it('returns 10 Lakhs (1,000,000) for bids between 1 Crore and 2 Crore', () => {
      expect(getAuctionIncrement(10000000)).toBe(1000000); // 1 Cr
      expect(getAuctionIncrement(15000000)).toBe(1000000); // 1.5 Cr
      expect(getAuctionIncrement(19000000)).toBe(1000000); // 1.9 Cr
    });

    it('returns 20 Lakhs (2,000,000) for bids between 2 Crore and 5 Crore', () => {
      expect(getAuctionIncrement(20000000)).toBe(2000000); // 2 Cr
      expect(getAuctionIncrement(34000000)).toBe(2000000); // 3.4 Cr
      expect(getAuctionIncrement(48000000)).toBe(2000000); // 4.8 Cr
    });

    it('returns 25 Lakhs (2,500,000) for bids between 5 Crore and 10 Crore', () => {
      expect(getAuctionIncrement(50000000)).toBe(2500000); // 5 Cr
      expect(getAuctionIncrement(75000000)).toBe(2500000); // 7.5 Cr
      expect(getAuctionIncrement(97500000)).toBe(2500000); // 9.75 Cr
    });

    it('returns 50 Lakhs (5,000,000) for bids of 10 Crore and above', () => {
      expect(getAuctionIncrement(100000000)).toBe(5000000); // 10 Cr
      expect(getAuctionIncrement(150000000)).toBe(5000000); // 15 Cr
      expect(getAuctionIncrement(250000000)).toBe(5000000); // 25 Cr (e.g. Starc/Pant record bids)
    });
  });

  describe('calculateNextValidBid', () => {
    it('returns base price as next bid when current bid is 0', () => {
      const res = calculateNextValidBid(0, 20000000); // 2 Cr base price
      expect(res.nextBid).toBe(20000000);
      expect(res.increment).toBe(20000000);
    });

    it('returns base price as next bid when current bid is negative', () => {
      const res = calculateNextValidBid(-500, 2000000); // 20L base price
      expect(res.nextBid).toBe(2000000);
      expect(res.increment).toBe(2000000);
    });

    it('calculates next bid correctly from 2 Cr opening bid', () => {
      const res = calculateNextValidBid(20000000, 20000000);
      expect(res.increment).toBe(2000000); // 20L slab
      expect(res.nextBid).toBe(22000000); // 2.20 Cr
    });

    it('transitions across slab boundary from 95L to 1 Cr to 1.10 Cr', () => {
      const step1 = calculateNextValidBid(9500000, 5000000);
      expect(step1.increment).toBe(500000); // 5L
      expect(step1.nextBid).toBe(10000000); // 1.00 Cr

      const step2 = calculateNextValidBid(10000000, 5000000);
      expect(step2.increment).toBe(1000000); // 10L
      expect(step2.nextBid).toBe(11000000); // 1.10 Cr
    });

    it('transitions across 10 Cr slab boundary', () => {
      const step1 = calculateNextValidBid(97500000, 20000000);
      expect(step1.increment).toBe(2500000); // 25L
      expect(step1.nextBid).toBe(100000000); // 10 Cr

      const step2 = calculateNextValidBid(100000000, 20000000);
      expect(step2.increment).toBe(5000000); // 50L
      expect(step2.nextBid).toBe(105000000); // 10.50 Cr
    });
  });
});

