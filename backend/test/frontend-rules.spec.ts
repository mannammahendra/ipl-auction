import { describe, it, expect } from 'vitest';
import { getAuctionIncrement, calculateNextValidBid } from '../../frontend/src/lib/auctionRules';
import { formatRupees, formatTime } from '../../frontend/src/lib/formatters';

describe('Frontend Auction Rules Unit Tests', () => {
  it('calculates increments correctly according to BCCI slab brackets', () => {
    // Under 1 Cr: 5 Lakh increment
    expect(getAuctionIncrement(2000000)).toBe(500000);
    expect(getAuctionIncrement(9500000)).toBe(500000);

    // 1 Cr to 2 Cr: 10 Lakh increment
    expect(getAuctionIncrement(10000000)).toBe(1000000);
    expect(getAuctionIncrement(19000000)).toBe(1000000);

    // 2 Cr to 5 Cr: 20 Lakh increment
    expect(getAuctionIncrement(20000000)).toBe(2000000);
    expect(getAuctionIncrement(48000000)).toBe(2000000);

    // 5 Cr to 10 Cr: 25 Lakh increment
    expect(getAuctionIncrement(50000000)).toBe(2500000);
    expect(getAuctionIncrement(97500000)).toBe(2500000);

    // Above 10 Cr: 50 Lakh increment
    expect(getAuctionIncrement(100000000)).toBe(5000000);
    expect(getAuctionIncrement(245000000)).toBe(5000000);
  });

  it('calculates the next valid bid for unbid lot (currentBid = 0)', () => {
    const calc = calculateNextValidBid(0, 20000000); // 2 Cr base price
    expect(calc.nextBid).toBe(20000000);
    expect(calc.increment).toBe(20000000);
  });

  it('calculates the next valid bid for active bidding (crosses brackets correctly)', () => {
    // Current bid 95L -> next is 1.00 Cr
    const step1 = calculateNextValidBid(9500000, 5000000);
    expect(step1.nextBid).toBe(10000000);
    expect(step1.increment).toBe(500000);

    // Current bid 1.90 Cr -> next is 2.00 Cr
    const step2 = calculateNextValidBid(19000000, 5000000);
    expect(step2.nextBid).toBe(20000000);
    expect(step2.increment).toBe(1000000);

    // Current bid 4.80 Cr -> next is 5.00 Cr
    const step3 = calculateNextValidBid(48000000, 5000000);
    expect(step3.nextBid).toBe(50000000);
    expect(step3.increment).toBe(2000000);
  });
});

describe('Frontend Formatter Unit Tests', () => {
  it('formats null, undefined, or invalid rupee amounts to ₹0', () => {
    expect(formatRupees(null)).toBe('₹0');
    expect(formatRupees(undefined)).toBe('₹0');
    expect(formatRupees(NaN)).toBe('₹0');
  });

  it('formats sub-lakh amounts using Indian numbering system', () => {
    expect(formatRupees(50000)).toBe('₹50,000');
    expect(formatRupees(99999)).toBe('₹99,999');
  });

  it('formats Lakh amounts with clean decimals', () => {
    expect(formatRupees(2000000)).toBe('₹20 L');
    expect(formatRupees(500000)).toBe('₹5 L');
    expect(formatRupees(750000)).toBe('₹7.50 L');
  });

  it('formats Crore amounts with clean decimals', () => {
    expect(formatRupees(10000000)).toBe('₹1.0 Cr');
    expect(formatRupees(20000000)).toBe('₹2.0 Cr');
    expect(formatRupees(247500000)).toBe('₹24.75 Cr');
  });

  it('formats countdown time into mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(14)).toBe('00:14');
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(75)).toBe('01:15');
    expect(formatTime(600)).toBe('10:00');
  });
});

