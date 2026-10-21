import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import bcrypt from 'bcrypt';
import { CreateRoomDto } from '../src/rooms/dto/create-room.dto.js';
import { RoomsService } from '../src/rooms/rooms.service.js';

describe('Room Password Mandatory Enforcement', () => {
  describe('CreateRoomDto Validation', () => {
    it('accepts payload with a valid password', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Mandatory Pass Room',
        password: 'SuperSecret123',
        startingPurse: 1200000000,
        minSquad: 18,
        maxSquad: 25,
        maxOverseas: 8,
        bidTimerSeconds: 25,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
      expect(dto.password).toBe('SuperSecret123');
    });

    it('rejects payload when password is missing', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'No Pass Room',
        startingPurse: 1200000000,
        minSquad: 18,
        maxSquad: 25,
      });

      const errors = await validate(dto);
      const passErr = errors.find((e) => e.property === 'password');
      expect(passErr).toBeDefined();
      expect(Object.values(passErr?.constraints || {})).toContain(
        'Please enter a password to create the auction room.',
      );
    });

    it('rejects payload when password is empty string', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Empty Pass Room',
        password: '',
        startingPurse: 1200000000,
      });

      const errors = await validate(dto);
      const passErr = errors.find((e) => e.property === 'password');
      expect(passErr).toBeDefined();
      expect(Object.values(passErr?.constraints || {})).toContain(
        'Please enter a password to create the auction room.',
      );
    });

    it('rejects payload when password is only whitespace', async () => {
      const dto = plainToInstance(CreateRoomDto, {
        name: 'Whitespace Pass Room',
        password: '     ',
        startingPurse: 1200000000,
      });

      const errors = await validate(dto);
      const passErr = errors.find((e) => e.property === 'password');
      expect(passErr).toBeDefined();
      expect(Object.values(passErr?.constraints || {})).toContain(
        'Please enter a password to create the auction room.',
      );
    });
  });

  describe('RoomsService Password Enforcement & Hashing', () => {
    function setupRoomsService() {
      const mockPrisma = {
        room: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        team: {
          createMany: vi.fn().mockResolvedValue({ count: 10 }),
          updateMany: vi.fn(),
          findFirst: vi.fn(),
        },
        roomMember: {
          create: vi.fn().mockResolvedValue({ id: 'member-1' }),
          findUnique: vi.fn(),
        },
        player: {
          createMany: vi.fn().mockResolvedValue({ count: 100 }),
          findMany: vi.fn().mockResolvedValue([{ id: 'p1', name: 'Virat Kohli', role: 'BATSMAN', country: 'India', basePrice: 20000000 }]),
          create: vi.fn(),
          count: vi.fn().mockResolvedValue(1),
        },
        auctionPlayer: {
          createMany: vi.fn().mockResolvedValue({ count: 100 }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({ id: 'user-1', name: 'TestUser' }),
          create: vi.fn(),
        },
      };

      const mockAuctionEngine = {
        broadcast: vi.fn(),
      };

      const service = new RoomsService(mockPrisma as any, mockAuctionEngine as any);
      return { service, mockPrisma, mockAuctionEngine };
    }

    it('throws BadRequestException when createRoom is called with missing password', async () => {
      const { service } = setupRoomsService();

      await expect(
        service.createRoom('user-1', {
          name: 'No Password Room',
        } as any),
      ).rejects.toThrow('Please enter a password to create the auction room.');
    });

    it('throws BadRequestException when createRoom is called with whitespace password', async () => {
      const { service } = setupRoomsService();

      await expect(
        service.createRoom('user-1', {
          name: 'Whitespace Password Room',
          password: '   \t  ',
        }),
      ).rejects.toThrow('Please enter a password to create the auction room.');
    });

    it('hashes password with bcrypt and stores hashed value upon room creation', async () => {
      const { service, mockPrisma } = setupRoomsService();

      mockPrisma.room.findUnique.mockResolvedValueOnce(null); // room code collision check

      let createdRoomData: any = null;
      mockPrisma.room.create.mockImplementation(({ data }: any) => {
        createdRoomData = data;
        return Promise.resolve({
          ...data,
          id: 'room-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      // getRoomById lookup uses findFirst
      mockPrisma.room.findFirst.mockImplementation(() => {
        return Promise.resolve({
          id: 'room-123',
          code: 'IPL-TEST',
          name: 'Secured Arena',
          password: createdRoomData?.password,
          hostId: 'user-1',
          status: 'LOBBY',
          members: [{ id: 'member-1', userId: 'user-1', role: 'HOST' }],
          teams: [],
          players: [],
          auctionPlayers: [
            { id: 'ap1', playerId: 'p1', currentPrice: 20000000, status: 'UPCOMING', lotNumber: 1, round: 1 },
          ],
        });
      });

      const result = await service.createRoom('user-1', {
        name: 'Secured Arena',
        password: 'MySecretPassword123',
      });

      // Verification: raw password must not match stored password directly
      expect(createdRoomData).toBeDefined();
      expect(createdRoomData.password).not.toBe('MySecretPassword123');

      // Stored password must be a valid bcrypt hash of MySecretPassword123
      const isMatch = await bcrypt.compare('MySecretPassword123', createdRoomData.password);
      expect(isMatch).toBe(true);

      // getRoomById sanitized response must NOT contain raw password, and must indicate hasPassword: true
      expect(result.password).toBeUndefined();
      expect((result as any).hasPassword).toBe(true);
    });

    it('enforces password checks in joinRoom', async () => {
      const { service, mockPrisma } = setupRoomsService();
      const rawPassword = 'RoomSecretPassword';
      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      const roomInDb = {
        id: 'room-join-test',
        code: 'IPL-JOIN',
        name: 'Join Room Test',
        password: hashedPassword,
        hostId: 'user-host',
        status: 'LOBBY',
        members: [{ id: 'm-host', userId: 'user-host', role: 'HOST' }],
        teams: [],
        players: [],
        auctionPlayers: [
          { id: 'ap1', playerId: 'p1', currentPrice: 20000000, status: 'UPCOMING', lotNumber: 1, round: 1 },
        ],
      };

      mockPrisma.room.findUnique.mockResolvedValue(roomInDb);
      mockPrisma.room.findFirst.mockResolvedValue({
        ...roomInDb,
        members: [
          { id: 'm-host', userId: 'user-host', role: 'HOST' },
          { id: 'm-guest-1', userId: 'user-guest-1', role: 'MEMBER' },
        ],
      });

      // Joining without password -> fails
      await expect(service.joinRoom('IPL-JOIN', 'user-guest-1')).rejects.toThrow(
        'Incorrect room password',
      );

      // Joining with wrong password -> fails
      await expect(service.joinRoom('IPL-JOIN', 'user-guest-1', 'WrongPassword')).rejects.toThrow(
        'Incorrect room password',
      );

      // Joining with correct password -> succeeds
      mockPrisma.roomMember.findUnique.mockResolvedValueOnce(null);
      const joined = await service.joinRoom('IPL-JOIN', 'user-guest-1', rawPassword);
      expect(joined).toBeDefined();
      expect(joined.id).toBe('room-join-test');
      expect(joined.password).toBeUndefined();
      expect((joined as any).hasPassword).toBe(true);
    });
  });
});

