export interface BidCalculation {
  nextBid: number;
  increment: number;
}

export function getAuctionIncrement(currentBid: number): number {
  if (currentBid < 10000000) {
    return 500000; // 5L up to 1 Cr
  } else if (currentBid < 20000000) {
    return 1000000; // 10L between 1 Cr and 2 Cr
  } else if (currentBid < 50000000) {
    return 2000000; // 20L between 2 Cr and 5 Cr
  } else if (currentBid < 100000000) {
    return 2500000; // 25L between 5 Cr and 10 Cr
  } else {
    return 5000000; // 50L above 10 Cr
  }
}

export function calculateNextValidBid(currentBid: number, basePrice: number): BidCalculation {
  if (currentBid <= 0) {
    return { nextBid: basePrice, increment: basePrice };
  }
  const increment = getAuctionIncrement(currentBid);
  return { nextBid: currentBid + increment, increment };
}

