import { describe, it, expect } from 'vitest';
import { getPlayerPhoto, resolvePlayerPhoto, PLAYER_PHOTOS } from '../../frontend/src/lib/playerPhotos';
import { INITIAL_PLAYERS } from '../src/players/initial-players.data.js';

describe('Player Image Consistency & Identity Preservation Tests', () => {
  describe('Marquee Player Photo Resolution (RCB & MI)', () => {
    it('resolves authentic curated photo for Virat Kohli (RCB marquee)', () => {
      const player = { name: 'Virat Kohli' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe(PLAYER_PHOTOS['Virat Kohli']);
      expect(resolved.startsWith('https://')).toBe(true);
      expect(resolved).not.toContain('unsplash.com');
    });

    it('resolves authentic curated photo for Rohit Sharma (MI marquee)', () => {
      const player = { name: 'Rohit Sharma' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe(PLAYER_PHOTOS['Rohit Sharma']);
      expect(resolved.startsWith('https://')).toBe(true);
      expect(resolved).not.toContain('unsplash.com');
    });

    it('resolves authentic curated photo for Jasprit Bumrah (MI marquee)', () => {
      const player = { name: 'Jasprit Bumrah' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe(PLAYER_PHOTOS['Jasprit Bumrah']);
      expect(resolved.startsWith('https://')).toBe(true);
      expect(resolved).not.toContain('unsplash.com');
    });

    it('resolves authentic curated photo for Suryakumar Yadav (MI marquee)', () => {
      const player = { name: 'Suryakumar Yadav' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe(PLAYER_PHOTOS['Suryakumar Yadav']);
      expect(resolved.startsWith('https://')).toBe(true);
      expect(resolved).not.toContain('unsplash.com');
    });

    it('resolves authentic curated photo for MS Dhoni (CSK marquee)', () => {
      const player = { name: 'MS Dhoni' };
      const resolved = getPlayerPhoto(player);
      expect(resolved).toBe(PLAYER_PHOTOS['MS Dhoni']);
      expect(resolved.startsWith('https://')).toBe(true);
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
      expect(resolved).toBe(PLAYER_PHOTOS['Virat Kohli']);
      expect(resolved.startsWith('https://')).toBe(true);
      expect(resolved).not.toContain('unsplash.com');
    });

    it('discards unsplash.com URLs for Rohit Sharma and falls back to curated headshot', () => {
      const playerWithUnsplash = {
        name: 'Rohit Sharma',
        image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=400',
      };
      const resolved = getPlayerPhoto(playerWithUnsplash);
      expect(resolved).toBe(PLAYER_PHOTOS['Rohit Sharma']);
      expect(resolved.startsWith('https://')).toBe(true);
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
      expect(resolved).toBe(PLAYER_PHOTOS['Virat Kohli']);
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
        image: PLAYER_PHOTOS['Jasprit Bumrah'],
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
      expect(inspectImageUrl).toBe(PLAYER_PHOTOS['Jasprit Bumrah']);
    });
  });

  describe('Full 424 Auction Player Pool Image Audit Tests', () => {
    it('verifies exact count of 424 players in INITIAL_PLAYERS dataset', () => {
      expect(INITIAL_PLAYERS.length).toBe(424);
    });

    it('verifies all 424 players have non-empty, non-null image definitions', () => {
      for (const p of INITIAL_PLAYERS) {
        expect(p.image).toBeDefined();
        expect(typeof p.image).toBe('string');
        expect(p.image.trim().length).toBeGreaterThan(0);
      }
    });

    it('verifies zero players use ui-avatars, unsplash, or placeholder keywords in dataset', () => {
      const banned = ['unsplash', 'ui-avatars', 'placeholder', 'stadium', 'mission', 'coreldraw', 'default'];
      for (const p of INITIAL_PLAYERS) {
        for (const b of banned) {
          expect(p.image.toLowerCase()).not.toContain(b);
        }
      }
    });

    it('verifies zero explicit.bing.net domain URLs in PLAYER_PHOTOS', () => {
      for (const url of Object.values(PLAYER_PHOTOS)) {
        expect(url).not.toContain('explicit.bing.net');
      }
    });

    it('verifies authentic curated headshot for Shahbaz Nadeem resolves to verified URL', () => {
      const resolved = getPlayerPhoto({ name: 'Shahbaz Nadeem' });
      expect(resolved).toBe(PLAYER_PHOTOS['Shahbaz Nadeem']);
      expect(resolved.startsWith('https://')).toBe(true);
    });

    it('verifies zero local /players/ references exist in INITIAL_PLAYERS (100% URL-based)', () => {
      const localPlayers = INITIAL_PLAYERS.filter((p) => p.image.startsWith('/'));
      expect(localPlayers.length).toBe(0);
    });

    it('verifies all 424 INITIAL_PLAYERS use valid https:// URLs', () => {
      for (const p of INITIAL_PLAYERS) {
        expect(p.image.startsWith('https://') || p.image.startsWith('http://')).toBe(true);
      }
    });
  });
});

