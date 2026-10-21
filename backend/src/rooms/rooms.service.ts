import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEFAULT_TEAMS } from '../constants/teams.constant.js';
import { AuctionEngine } from '../auction/auction.engine.js';
import { INITIAL_PLAYERS } from '../players/initial-players.data.js';

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AuctionEngine))
    private readonly auctionEngine: AuctionEngine,
  ) {}

  generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'IPL-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async createRoom(
    hostUserId: string,
    options: {
      name?: string;
      password?: string;
      startingPurse?: number;
      squadSize?: number;
      minSquad?: number;
      maxSquad?: number;
      maxOverseas?: number;
      bidTimerSeconds?: number;
      snipeExtensionSeconds?: number;
    },
  ) {
    let code = this.generateRoomCode();
    let exists = await this.prisma.room.findUnique({ where: { code } });
    while (exists) {
      code = this.generateRoomCode();
      exists = await this.prisma.room.findUnique({ where: { code } });
    }

    const startingPurse = options.startingPurse ? Number(options.startingPurse) : 1200000000;
    
    let minSquad = options.minSquad ? Number(options.minSquad) : 18;
    let maxSquad = options.maxSquad ? Number(options.maxSquad) : 25;
    let maxOverseas = options.maxOverseas ? Number(options.maxOverseas) : 8;

    if (options.squadSize) {
      const sq = Number(options.squadSize);
      minSquad = sq;
      maxSquad = sq;
      if (!options.maxOverseas) {
        maxOverseas = sq <= 11 ? 4 : sq >= 25 ? 8 : Math.min(8, Math.max(4, Math.round((sq * 8) / 25)));
      }
    }

    if (!Number.isInteger(minSquad) || minSquad <= 0) {
      throw new BadRequestException('Minimum squad size must be a positive integer');
    }
    if (!Number.isInteger(maxSquad) || maxSquad <= 0) {
      throw new BadRequestException('Maximum squad size must be a positive integer');
    }
    if (minSquad > maxSquad) {
      throw new BadRequestException(
        `Minimum squad size (${minSquad}) cannot exceed maximum squad size (${maxSquad})`,
      );
    }
    if (!Number.isFinite(startingPurse) || startingPurse <= 0) {
      throw new BadRequestException('Starting purse must be a positive number');
    }
    if (maxOverseas > maxSquad) {
      throw new BadRequestException('Maximum overseas quota cannot exceed maximum squad size');
    }

    const bidTimerSeconds = options.bidTimerSeconds ? Number(options.bidTimerSeconds) : 25;
    const snipeExtensionSeconds = options.snipeExtensionSeconds
      ? Number(options.snipeExtensionSeconds)
      : Math.max(3, Math.min(10, Math.floor(bidTimerSeconds / 2)));

    const room = await this.prisma.room.create({
      data: {
        code,
        name: options.name || `IPL Mega Auction ${code}`,
        password: options.password || null,
        hostId: hostUserId,
        startingPurse,
        minSquad,
        maxSquad,
        maxOverseas,
        bidTimerSeconds,
        snipeExtensionSeconds,
        status: 'LOBBY',
        members: {
          create: {
            userId: hostUserId,
            isHost: true,
            isReady: true,
          },
        },
      },
    });

    await this.prisma.team.createMany({
      data: DEFAULT_TEAMS.map((team) => ({
        id: randomUUID(),
        roomId: room.id,
        name: team.name,
        shortName: team.shortName,
        color: team.color,
        secondaryColor: team.secondaryColor,
        logo: team.logo,
        initialPurse: startingPurse,
        currentPurse: startingPurse,
        isDefault: true,
      })),
    });

    // Auto-assign host to first franchise (e.g. CSK) so host always has an active bidding team
    const firstTeam = await this.prisma.team.findFirst({
      where: { roomId: room.id },
      orderBy: { name: 'asc' },
    });
    if (firstTeam) {
      await this.prisma.roomMember.update({
        where: { roomId_userId: { roomId: room.id, userId: hostUserId } },
        data: { teamId: firstTeam.id },
      });
    }

    let allPlayers = await this.prisma.player.findMany();
    if (allPlayers.length === 0) {
      this.logger.warn('No players found in database when creating room! Auto-seeding INITIAL_PLAYERS...');
      for (const p of INITIAL_PLAYERS) {
        await this.prisma.player.create({ data: p });
      }
      allPlayers = await this.prisma.player.findMany();
    }

    const MARQUEE_SET_1_NAMES = new Set([
      'MS Dhoni', 'Rohit Sharma', 'Virat Kohli', 'Jasprit Bumrah',
      'Hardik Pandya', 'Rishabh Pant', 'Shreyas Iyer', 'KL Rahul',
      'Pat Cummins', 'Mitchell Starc', 'Jos Buttler', 'Suryakumar Yadav',
      'Shubman Gill', 'Heinrich Klaasen', 'Travis Head', 'Rashid Khan'
    ]);

    const MARQUEE_SET_2_NAMES = new Set([
      'Glenn Maxwell', 'Ravindra Jadeja', 'Mohammed Shami', 'Mohammed Siraj',
      'Yuzvendra Chahal', 'David Warner', 'Faf du Plessis', 'Kagiso Rabada',
      'Trent Boult', 'Axar Patel', 'Arshdeep Singh', 'Rinku Singh',
      'Ruturaj Gaikwad', 'Sanju Samson', 'Ishan Kishan', 'Quinton de Kock'
    ]);

    // Group players into official IPL Sets:
    // Set 1: Marquee Set 1 (MS Dhoni, Rohit Sharma, Virat Kohli & Top Global Icons)
    // Set 2: Marquee Set 2 (Superstar All-rounders, Fast Bowlers & Batsmen)
    // Set 3: List A (Remaining ₹2.00 Cr Capped Stars)
    // Set 4: List B (₹1.50 Cr Gold Stars)
    // Set 5: List C (₹1.00 Cr Silver Stars)
    // Set 6: List D (₹50L - ₹75L Bronze Stars)
    // Set 7: List E (₹20L - ₹40L Uncapped & Emerging)
    const marqueeSet1: typeof allPlayers = [];
    const marqueeSet2: typeof allPlayers = [];
    const listA: typeof allPlayers = [];
    const listB: typeof allPlayers = [];
    const listC: typeof allPlayers = [];
    const listD: typeof allPlayers = [];
    const listE: typeof allPlayers = [];

    for (const p of allPlayers) {
      if (MARQUEE_SET_1_NAMES.has(p.name)) {
        marqueeSet1.push(p);
      } else if (MARQUEE_SET_2_NAMES.has(p.name)) {
        marqueeSet2.push(p);
      } else if (p.basePrice >= 20000000) {
        listA.push(p);
      } else if (p.basePrice >= 15000000) {
        listB.push(p);
      } else if (p.basePrice >= 10000000) {
        listC.push(p);
      } else if (p.basePrice >= 5000000) {
        listD.push(p);
      } else {
        listE.push(p);
      }
    }

    // In authentic IPL mega auctions, marquee sets are auctioned first:
    // Marquee 1 -> Marquee 2 -> List A -> List B -> List C -> List D -> List E.
    // Within each set, players are randomized so every auction room has an exciting, fresh dynamic draw!
    const sequencedPlayers = [
      ...shuffleArray(marqueeSet1),
      ...shuffleArray(marqueeSet2),
      ...shuffleArray(listA),
      ...shuffleArray(listB),
      ...shuffleArray(listC),
      ...shuffleArray(listD),
      ...shuffleArray(listE),
    ];

    // High performance bulk insert in a single query
    await this.prisma.auctionPlayer.createMany({
      data: sequencedPlayers.map((player, idx) => ({
        id: randomUUID(),
        roomId: room.id,
        playerId: player.id,
        status: 'UPCOMING',
        lotNumber: idx + 1,
      })),
    });

    return this.getRoomById(room.id, hostUserId);
  }

  async joinRoom(code: string, userId: string, password?: string) {
    const room = await this.prisma.room.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { members: true },
    });

    if (!room) {
      throw new NotFoundException('Auction room not found. Please check your room code.');
    }

    if (room.password && room.password !== password) {
      throw new ForbiddenException('Incorrect room password');
    }

    let member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    });

    if (!member) {
      if (room.members.length >= 24) {
        throw new BadRequestException('Room is at full capacity (24 participants)');
      }

      member = await this.prisma.roomMember.create({
        data: {
          roomId: room.id,
          userId,
          isHost: room.hostId === userId,
        },
      });
    } else {
      await this.prisma.roomMember.update({
        where: { id: member.id },
        data: { isOnline: true },
      });
    }

    return this.getRoomById(room.id, userId);
  }

  async getRoomById(roomIdOrCode: string, userId?: string): Promise<any> {
    const room = await this.prisma.room.findFirst({
      where: {
        OR: [{ id: roomIdOrCode }, { code: roomIdOrCode.toUpperCase() }],
      },
      include: {
        host: { select: { id: true, username: true, avatar: true } },
        members: {
          include: {
            user: { select: { id: true, username: true, isGuest: true, avatar: true } },
            team: true,
          },
        },
        teams: {
          include: {
            squad: { include: { player: true } },
            members: { include: { user: { select: { id: true, username: true } } } },
          },
        },
        auctionPlayers: {
          include: { player: true },
          orderBy: { lotNumber: 'asc' },
        },
      },
    });

    if (!room) throw new NotFoundException('Room not found');

    if (userId) {
      const existingMember = room.members.find((m) => m.userId === userId);
      if (!existingMember) {
        let userExists = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!userExists) {
          userExists = await this.prisma.user.create({
            data: {
              id: userId,
              username: `Manager_${userId.slice(0, 4)}`,
              isGuest: true,
            },
          });
        }
        await this.prisma.roomMember.create({
          data: {
            roomId: room.id,
            userId,
            isHost: room.hostId === userId,
            isOnline: true,
          },
        });
        return this.getRoomById(room.id);
      }
    }

    if (room.status === 'LOBBY') {
      const totalGlobalPlayers = await this.prisma.player.count();
      if (room.auctionPlayers.length < totalGlobalPlayers) {
        const existingPlayerIds = new Set(room.auctionPlayers.map((ap) => ap.playerId));
        const missingPlayers = await this.prisma.player.findMany({
          where: { id: { notIn: Array.from(existingPlayerIds) } },
        });
        if (missingPlayers.length > 0) {
          const highestLot = room.auctionPlayers.reduce((max, ap) => Math.max(max, ap.lotNumber), 0);
          await this.prisma.auctionPlayer.createMany({
            data: missingPlayers.map((p, idx) => ({
              id: randomUUID(),
              roomId: room.id,
              playerId: p.id,
              status: 'UPCOMING',
              lotNumber: highestLot + idx + 1,
              round: 1,
            })),
          });
          const reloadedPlayers = await this.prisma.auctionPlayer.findMany({
            where: { roomId: room.id },
            include: { player: true },
            orderBy: { lotNumber: 'asc' },
          });
          room.auctionPlayers = reloadedPlayers;
        }
      }
    }

    const currentAuctionPlayer = room.currentAuctionPlayerId
      ? room.auctionPlayers.find((ap) => ap.id === room.currentAuctionPlayerId) || null
      : room.auctionPlayers.find((ap) => ap.status === 'NOMINATED') || null;

    return {
      ...room,
      currentAuctionPlayer,
    };
  }

  async selectTeam(roomId: string, userId: string, teamId: string, managerName?: string) {
    let member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!member) {
      const room = await this.prisma.room.findFirst({
        where: {
          OR: [{ id: roomId }, { code: roomId.toUpperCase() }],
        },
      });
      if (!room) throw new NotFoundException('Room not found');

      let userExists = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        userExists = await this.prisma.user.create({
          data: {
            id: userId,
            username: `Manager_${userId.slice(0, 4)}`,
            isGuest: true,
          },
        });
      }
      member = await this.prisma.roomMember.create({
        data: {
          roomId: room.id,
          userId,
          isHost: room.hostId === userId,
          isOnline: true,
        },
      });
    }

    const team = await this.prisma.team.findFirst({
      where: { id: teamId, roomId: member.roomId },
      include: { members: true },
    });

    if (!team) throw new NotFoundException('Franchise team not found');

    const takenMember = await this.prisma.roomMember.findFirst({
      where: { roomId: member.roomId, teamId: team.id, userId: { not: userId } },
      include: { user: true },
    });
    if (takenMember) {
      const otherName = takenMember.user?.username || 'another manager';
      throw new BadRequestException(`Team ${team.name} has already been chosen by ${otherName}`);
    }

    if (managerName && managerName.trim()) {
      const desiredName = managerName.trim();
      const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
      if (currentUser && currentUser.username !== desiredName) {
        try {
          await this.prisma.user.update({
            where: { id: userId },
            data: { username: desiredName },
          });
        } catch (err: any) {
          if (err.code === 'P2002') {
            const suffixed = `${desiredName}#${Math.floor(1000 + Math.random() * 9000)}`;
            await this.prisma.user.update({
              where: { id: userId },
              data: { username: suffixed },
            });
          } else {
            throw err;
          }
        }
      }
    }

    await this.prisma.roomMember.update({
      where: { id: member.id },
      data: { teamId: team.id },
    });

    const updatedRoom = await this.getRoomById(member.roomId, userId);
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    const managerUsername = currentUser?.username || 'Manager';

    // Broadcast room_sync & team_selected so all users in the room see this in real-time!
    this.auctionEngine.broadcast('room_sync', updatedRoom.id, {
      room: updatedRoom,
      currentAuctionPlayer: updatedRoom.currentAuctionPlayer || null,
      serverTime: Date.now(),
    });

    this.auctionEngine.broadcast('team_selected', updatedRoom.id, {
      userId,
      username: managerUsername,
      teamId: team.id,
      teamName: team.name,
      teamShortName: team.shortName,
      teamColor: team.color,
      teamLogo: team.logo,
      room: updatedRoom,
      message: `👤 ${managerUsername} claimed ${team.name} (${team.shortName})`,
      serverTime: Date.now(),
    });

    return updatedRoom;
  }

  async updateSettings(
    roomId: string,
    hostUserId: string,
    settings: {
      name?: string;
      startingPurse?: number;
      squadSize?: number;
      minSquad?: number;
      maxSquad?: number;
      maxOverseas?: number;
      bidTimerSeconds?: number;
      snipeExtensionSeconds?: number;
    },
  ) {
    const room = await this.prisma.room.findFirst({
      where: {
        OR: [{ id: roomId }, { code: roomId.toUpperCase() }],
      },
      include: { members: true },
    });
    if (!room) throw new NotFoundException('Room not found');

    const isHost = room.hostId === hostUserId || room.members.some((m) => m.userId === hostUserId && m.isHost);
    if (!isHost) throw new ForbiddenException('Only the host can modify auction rules');

    const startingPurse = settings.startingPurse !== undefined ? Number(settings.startingPurse) : undefined;
    const bidTimerSeconds = settings.bidTimerSeconds !== undefined ? Number(settings.bidTimerSeconds) : undefined;
    let minSquad = settings.minSquad !== undefined ? Number(settings.minSquad) : undefined;
    let maxSquad = settings.maxSquad !== undefined ? Number(settings.maxSquad) : undefined;
    let maxOverseas = settings.maxOverseas !== undefined ? Number(settings.maxOverseas) : undefined;

    if (settings.squadSize !== undefined) {
      const sq = Number(settings.squadSize);
      minSquad = sq;
      maxSquad = sq;
      if (!maxOverseas) {
        maxOverseas = sq <= 11 ? 4 : sq >= 25 ? 8 : Math.min(8, Math.max(4, Math.round((sq * 8) / 25)));
      }
    }

    const effectiveMin = minSquad !== undefined ? minSquad : room.minSquad;
    const effectiveMax = maxSquad !== undefined ? maxSquad : room.maxSquad;

    if (effectiveMin > effectiveMax) {
      throw new BadRequestException(
        `Minimum squad size (${effectiveMin}) cannot exceed maximum squad size (${effectiveMax})`,
      );
    }
    if (minSquad !== undefined && (!Number.isInteger(minSquad) || minSquad <= 0)) {
      throw new BadRequestException('Minimum squad size must be a positive integer');
    }
    if (maxSquad !== undefined && (!Number.isInteger(maxSquad) || maxSquad <= 0)) {
      throw new BadRequestException('Maximum squad size must be a positive integer');
    }
    if (startingPurse !== undefined && (!Number.isFinite(startingPurse) || startingPurse <= 0)) {
      throw new BadRequestException('Starting purse must be a positive number');
    }
    if (maxOverseas !== undefined && maxOverseas > effectiveMax) {
      throw new BadRequestException('Maximum overseas quota cannot exceed maximum squad size');
    }

    if (maxSquad !== undefined) {
      const highestSquadTeam = await this.prisma.team.findFirst({
        where: { roomId: room.id },
        orderBy: { totalPlayers: 'desc' },
        select: { totalPlayers: true, name: true },
      });
      if (highestSquadTeam && maxSquad < highestSquadTeam.totalPlayers) {
        throw new BadRequestException(
          `Cannot reduce max squad to ${maxSquad}: franchise ${highestSquadTeam.name} already has ${highestSquadTeam.totalPlayers} players in its squad`,
        );
      }
    }

    const snipeExtensionSeconds = bidTimerSeconds
      ? Math.max(3, Math.min(10, Math.floor(bidTimerSeconds / 2)))
      : (settings.snipeExtensionSeconds !== undefined ? Number(settings.snipeExtensionSeconds) : undefined);

    await this.prisma.room.update({
      where: { id: room.id },
      data: {
        ...(settings.name ? { name: settings.name } : {}),
        ...(startingPurse !== undefined ? { startingPurse } : {}),
        ...(minSquad !== undefined ? { minSquad } : {}),
        ...(maxSquad !== undefined ? { maxSquad } : {}),
        ...(maxOverseas !== undefined ? { maxOverseas } : {}),
        ...(bidTimerSeconds !== undefined ? { bidTimerSeconds } : {}),
        ...(snipeExtensionSeconds !== undefined ? { snipeExtensionSeconds } : {}),
      },
    });

    if (startingPurse !== undefined && room.status === 'LOBBY') {
      await this.prisma.team.updateMany({
        where: { roomId: room.id },
        data: {
          initialPurse: startingPurse,
          currentPurse: startingPurse,
        },
      });
    }

    const updatedRoom = await this.getRoomById(room.id, hostUserId);

    this.auctionEngine.broadcast('room_sync', updatedRoom.id, {
      room: updatedRoom,
      currentAuctionPlayer: updatedRoom.currentAuctionPlayer || null,
      serverTime: Date.now(),
    });
    this.auctionEngine.broadcast('settings_updated', updatedRoom.id, {
      room: updatedRoom,
      message: '⚙️ Auction settings were updated by the host',
      serverTime: Date.now(),
    });

    return updatedRoom;
  }

  async toggleReady(roomId: string, userId: string) {
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (!member) throw new BadRequestException('Not a member');

    const updatedMember = await this.prisma.roomMember.update({
      where: { id: member.id },
      data: { isReady: !member.isReady },
    });

    const room = await this.getRoomById(roomId, userId);
    this.auctionEngine.broadcast('room_sync', room.id, {
      room,
      currentAuctionPlayer: room.currentAuctionPlayer || null,
      serverTime: Date.now(),
    });

    return updatedMember;
  }
}
