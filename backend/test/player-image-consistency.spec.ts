import { describe, it, expect } from 'vitest';
import { getPlayerPhoto, resolvePlayerPhoto, PLAYER_PHOTOS } from '../../frontend/src/lib/playerPhotos';
import { INITIAL_PLAYERS } from '../src/players/initial-players.data.js';

describe('Player Image Consistency & Identity Preservation Tests', () => {
  describe('Marquee Player Photo Resolution (RCB & MI)', () => {
    it('resolves authentic curated photo for Virat Kohli (RCB marquee)', () => {
      const player = { name: 'Virat Kohli', image: '/players/virat_kohli.png' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe('/players/virat_kohli.png');
      expect(resolved).not.toContain('unsplash.com');
    });

    it('resolves authentic curated photo for Rohit Sharma (MI marquee)', () => {
      const player = { name: 'Rohit Sharma', image: '/players/rohit_sharma.png' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe('/players/rohit_sharma.png');
      expect(resolved).not.toContain('unsplash.com');
    });

    it('resolves authentic curated photo for Jasprit Bumrah (MI marquee)', () => {
      const player = { name: 'Jasprit Bumrah', image: '/players/jasprit_bumrah.png' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe('/players/jasprit_bumrah.png');
      expect(resolved).not.toContain('unsplash.com');
    });

    it('resolves authentic curated photo for Suryakumar Yadav (MI marquee)', () => {
      const player = { name: 'Suryakumar Yadav', image: '/players/suryakumar_yadav.png' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe('/players/suryakumar_yadav.png');
      expect(resolved).not.toContain('unsplash.com');
    });

    it('resolves authentic curated photo for MS Dhoni (CSK marquee)', () => {
      const player = { name: 'MS Dhoni', image: '/players/ms_dhoni.jpg' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe('/players/ms_dhoni.jpg');
      expect(resolved).not.toContain('unsplash.com');
    });
  });

  describe('Unsplash & Bogus Placeholder Filtering', () => {
    it('discards unsplash.com URLs in player.image and falls back to curated headshot', () => {
      const playerWithUnsplash = {
        name: 'Virat Kohli',
        image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=400',
      };
      const resolved = getPlayerPhoto(playerWithUnsplash);
      expect(resolved).toBe('/players/virat_kohli.png');
      expect(resolved).not.toContain('unsplash.com');
    });

    it('discards unsplash.com URLs for Rohit Sharma and falls back to curated headshot', () => {
      const playerWithUnsplash = {
        name: 'Rohit Sharma',
        image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=400',
      };
      const resolved = getPlayerPhoto(playerWithUnsplash);
      expect(resolved).toBe('/players/rohit_sharma.png');
      expect(resolved).not.toContain('unsplash.com');
    });

    it('verifies INITIAL_PLAYERS seed list contains zero unsplash URLs', () => {
      const unsplashEntries = INITIAL_PLAYERS.filter(
        (p) => p.image && p.image.includes('unsplash.com'),
      );
      expect(unsplashEntries).toHaveLength(0);
    });
  });

  describe('Null Safety & Edge Case Handling', () => {
    it('handles undefined and null player gracefully without throwing', () => {
      expect(() => getPlayerPhoto(null)).not.toThrow();
      expect(() => getPlayerPhoto(undefined)).not.toThrow();
      expect(getPlayerPhoto(null)).toContain('ui-avatars.com');
      expect(getPlayerPhoto(undefined)).toContain('ui-avatars.com');
    });

    it('handles player with missing name gracefully', () => {
      expect(() => getPlayerPhoto({ name: '' })).not.toThrow();
      const resolved = getPlayerPhoto({ name: '' });
      expect(resolved).toContain('ui-avatars.com');
    });

    it('handles case-insensitive whitespace-padded player names', () => {
      const resolved = getPlayerPhoto({ name: '  virat kohli  ' });
      expect(resolved).toBe('/players/virat_kohli.png');
    });

    it('resolvePlayerPhoto fallback works for missing or unknown players', () => {
      const customFallback = 'https://example.com/default.png';
      expect(resolvePlayerPhoto('Unknown Player 12345', customFallback)).toBe(customFallback);
      expect(resolvePlayerPhoto(null, customFallback)).toBe(customFallback);
    });
  });

  describe('Auction Podium to Squad Inspection Identity Parity', () => {
    it('guarantees identical image URL between auction podium and team inspect squad', () => {
      const playerRecord = {
        id: 'p_bumrah',
        name: 'Jasprit Bumrah',
        image: '/players/jasprit_bumrah.png',
        role: 'BOWLER',
        basePrice: 20000000,
        isOverseas: false,
      };

      // 1. Image shown on Auction Podium
      const podiumImageUrl = getPlayerPhoto(playerRecord);

      // 2. Simulated purchase by Mumbai Indians (MI)
      const squadMember = {
        id: 'squad_ap1',
        teamId: 'team_mi',
        playerId: playerRecord.id,
        purchasePrice: 180000000,
        player: playerRecord,
      };

      // 3. Image shown in Franchise Leaderboard Inspect section
      const inspectImageUrl = getPlayerPhoto(squadMember.player);

      // Verify 100% strict equality
      expect(inspectImageUrl).toBe(podiumImageUrl);
      expect(inspectImageUrl).toBe('/players/jasprit_bumrah.png');
    });
  });
});

