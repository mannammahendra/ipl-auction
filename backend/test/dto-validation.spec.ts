import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRoomDto } from '../src/rooms/dto/create-room.dto.js';
import { UpdateSettingsDto } from '../src/rooms/dto/update-settings.dto.js';
import { PlaceBidDto } from '../src/auction/dto/auction-action.dto.js';

describe('DTO Input Validation (class-validator)', () => {
  describe('CreateRoomDto', () => {
    it('validates a correct payload successfully with required password', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Wankhede Arena',
        password: 'securePassword123',
        startingPurse: 1200000000,
        minSquad: 18,
        maxSquad: 25,
        maxOverseas: 8,
        bidTimerSeconds: 25,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('fails when password is missing', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Missing Password Arena',
      });
      const errors = await validate(dto);
      const passError = errors.find((e) => e.property === 'password');
      expect(passError).toBeDefined();
    });

    it('fails when password is empty string', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Empty Password Arena',
        password: '',
      });
      const errors = await validate(dto);
      const passError = errors.find((e) => e.property === 'password');
      expect(passError).toBeDefined();
    });

    it('fails when password is whitespace-only', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Whitespace Password Arena',
        password: '    ',
      });
      const errors = await validate(dto);
      const passError = errors.find((e) => e.property === 'password');
      expect(passError).toBeDefined();
    });

    it('fails when name is not a string (e.g. numeric)', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 12345,
        password: 'validPassword123',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('fails when squad sizes or purse are negative', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Negative Squad Test',
        password: 'validPassword123',
        minSquad: -5,
        startingPurse: -1000,
      });
      const errors = await validate(dto);
      const minSquadError = errors.find((e) => e.property === 'minSquad');
      const purseError = errors.find((e) => e.property === 'startingPurse');
      expect(minSquadError).toBeDefined();
      expect(purseError).toBeDefined();
    });

    it('fails when minSquad is zero', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Zero Squad Test',
        password: 'validPassword123',
        minSquad: 0,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'minSquad')).toBe(true);
    });
  });

  describe('UpdateSettingsDto', () => {
    it('accepts partial valid updates', async () => {
      const dto = plainToInstance(UpdateSettingsDto, {
        bidTimerSeconds: 15,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects negative timer seconds', async () => {
      const dto = plainToInstance(UpdateSettingsDto, {
        bidTimerSeconds: -10,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'bidTimerSeconds')).toBe(true);
    });
  });

  describe('PlaceBidDto', () => {
    it('validates correct teamId and positive amount', async () => {
      const dto = plainToInstance(PlaceBidDto, {
        teamId: 'team-csk-123',
        amount: 50000000,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('fails when teamId is missing', async () => {
      const dto = plainToInstance(PlaceBidDto, {
        amount: 50000000,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'teamId')).toBe(true);
    });

    it('fails when amount is zero or negative', async () => {
      const dto = plainToInstance(PlaceBidDto, {
        teamId: 'team-csk-123',
        amount: 0,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'amount')).toBe(true);
    });
  });
});
