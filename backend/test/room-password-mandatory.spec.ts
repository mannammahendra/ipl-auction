import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import * as bcrypt from 'bcrypt';
import { CreateRoomDto } from '../src/rooms/dto/create-room.dto.js';
import { RoomsService } from '../src/rooms/rooms.service.js';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('Mandatory Auction Room Password Test Suite', () => {
  describe('1. CreateRoomDto Validation', () => {
    it('rejects payload when password is completely missing', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'No Password Room',
      });
      const errors = await validate(dto);
      const passError = errors.find((e) => e.property === 'password');
      expect(passError).toBeDefined();
      expect(Object.values(passError!.constraints || {})).toContain(
        'Please enter a password to create the auction room.'
      );
    });

    it('rejects payload when password is empty string', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Empty Password Room',
        password: '',
      });
      const errors = await validate(dto);
      const passError = errors.find((e) => e.property === 'password');
      expect(passError).toBeDefined();
      expect(Object.values(passError!.constraints || {})).toContain(
        'Please enter a password to create the auction room.'
      );
    });

    it('rejects payload when password contains only whitespace', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Whitespace Password Room',
        password: '     ',
      });
      const errors = await validate(dto);
      const passError = errors.find((e) => e.property === 'password');
      expect(passError).toBeDefined();
      expect(Object.values(passError!.constraints || {})).toContain(
        'Please enter a password to create the auction room.'
      );
    });

    it('succeeds when a valid non-empty password is provided', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Valid Password Room',
        password: 'superSecretPassword123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('2. RoomsService.createRoom Service-Level Enforcement', () => {
    const mockPrisma = {
      room: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn(),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'room-uuid-1',
            ...data,
            members: [],
            teams: [],
            auctionPlayers: [],
          })
        ),
      },
      team: {
        createMany: vi.fn().mockResolvedValue({ count: 10 }),
        findFirst: vi.fn().mockResolvedValue({ id: 'team-1', name: 'CSK' }),
      },
      player: {
        count: vi.fn().mockResolvedValue(5),
        findMany: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Kohli' }]),
      },
      auctionPlayer: {
        createMany: vi.fn().mockResolvedValue({ count: 5 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      roomMember: {
        findUnique: vi.fn().mockResolvedValue({ id: 'member-1' }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'member-1' }),
      },
    };

    const mockAuctionEngine = {
      broadcast: vi.fn(),
    };

    const service = new RoomsService(mockPrisma as any, mockAuctionEngine as any);

    it('throws BadRequestException if password is empty or missing', async () => {
      await expect(
        service.createRoom('user-1', {
          name: 'Direct Call Room',
          password: '',
        } as any)
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createRoom('user-1', {
          name: 'Direct Call Room',
          password: undefined,
        } as any)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if password is whitespace-only', async () => {
      await expect(
        service.createRoom('user-1', {
          name: 'Direct Call Room',
          password: '   \t  \n ',
        })
      ).rejects.toThrow('Please enter a password to create the auction room.');
    });

    it('creates room successfully and hashes password with bcrypt when valid password provided', async () => {
      const rawPassword = 'mySecretAuctionPassword';

      // Mock getRoomById return
      vi.spyOn(service, 'getRoomById').mockImplementation(async (roomId: string) => {
        return {
          id: roomId,
          name: 'IPL Test Arena',
          code: 'IPL-9999',
          hasPassword: true,
        } as any;
      });

      const result = await service.createRoom('host-123', {
        name: 'IPL Test Arena',
        password: rawPassword,
        startingPurse: 1200000000,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.room.create).toHaveBeenCalled();

      const createCall = mockPrisma.room.create.mock.calls[0][0];
      expect(createCall.data.password).toBeDefined();
      // Ensure the stored password is not plaintext
      expect(createCall.data.password).not.toBe(rawPassword);
      // Ensure it is a valid bcrypt hash
      expect(createCall.data.password.startsWith('$2a$') || createCall.data.password.startsWith('$2b$')).toBe(true);
      // Verify bcrypt comparison succeeds with the original password
      const match = await bcrypt.compare(rawPassword, createCall.data.password);
      expect(match).toBe(true);
    });
  });

  describe('3. Password Verification on Join', () => {
    it('allows join when correct password is provided for bcrypt-hashed room', async () => {
      const rawPassword = 'auctionPass2025';
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      const mockPrisma = {
        room: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'room-1',
            code: 'IPL-7777',
            password: hashedPassword,
            members: [],
          }),
        },
        roomMember: {
          findUnique: vi.fn().mockResolvedValue({ id: 'member-1' }),
          update: vi.fn().mockResolvedValue({ id: 'member-1' }),
        },
      };
      const service = new RoomsService(mockPrisma as any, {} as any);
      vi.spyOn(service, 'getRoomById').mockResolvedValue({ id: 'room-1', hasPassword: true } as any);

      const result = await service.joinRoom('IPL-7777', 'user-2', rawPassword);
      expect(result).toBeDefined();
    });

    it('rejects join with ForbiddenException when password is incorrect', async () => {
      const rawPassword = 'auctionPass2025';
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      const mockPrisma = {
        room: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'room-1',
            code: 'IPL-7777',
            password: hashedPassword,
            members: [],
          }),
        },
      };
      const service = new RoomsService(mockPrisma as any, {} as any);

      await expect(service.joinRoom('IPL-7777', 'user-2', 'wrongPassword')).rejects.toThrow(
        ForbiddenException
      );
      await expect(service.joinRoom('IPL-7777', 'user-2', '')).rejects.toThrow(
        ForbiddenException
      );
      await expect(service.joinRoom('IPL-7777', 'user-2', undefined)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('preserves backward compatibility with legacy plaintext room passwords', async () => {
      const mockPrisma = {
        room: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'room-legacy',
            code: 'IPL-1234',
            password: 'legacyPlainPassword',
            members: [],
          }),
        },
        roomMember: {
          findUnique: vi.fn().mockResolvedValue({ id: 'member-legacy' }),
          update: vi.fn().mockResolvedValue({ id: 'member-legacy' }),
        },
      };
      const service = new RoomsService(mockPrisma as any, {} as any);
      vi.spyOn(service, 'getRoomById').mockResolvedValue({ id: 'room-legacy', hasPassword: true } as any);

      const result = await service.joinRoom('IPL-1234', 'user-3', 'legacyPlainPassword');
      expect(result).toBeDefined();

      await expect(service.joinRoom('IPL-1234', 'user-3', 'wrongPass')).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('4. Secure Room Output (Never Exposing Password)', () => {
    it('strips password field and provides hasPassword: true flag', async () => {
      const mockPrisma = {
        room: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'room-secret',
            code: 'IPL-8888',
            password: '$2b$10$secretHashStringHere',
            status: 'AUCTION_ACTIVE',
            hostId: 'host-1',
            members: [{ userId: 'host-1' }],
            teams: [],
            auctionPlayers: [],
          }),
        },
      };
      const service = new RoomsService(mockPrisma as any, {} as any);

      const roomData = await service.getRoomById('room-secret', 'host-1');
      expect(roomData.password).toBeUndefined();
      expect(roomData.hasPassword).toBe(true);
    });
  });
});
