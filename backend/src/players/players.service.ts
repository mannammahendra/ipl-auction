import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: { role?: string; tier?: string; overseas?: boolean; search?: string }) {
    const where: any = {};

    if (query?.role) {
      where.role = query.role.toUpperCase();
    }
    if (query?.tier) {
      where.tier = query.tier.toUpperCase();
    }
    if (query?.overseas !== undefined) {
      where.isOverseas = String(query.overseas) === 'true';
    }
    if (query?.search) {
      where.OR = [
        { name: { contains: query.search } },
        { country: { contains: query.search } },
      ];
    }

    return this.prisma.player.findMany({
      where,
      orderBy: [
        { tier: 'asc' },
        { basePrice: 'desc' },
        { name: 'asc' },
      ],
    });
  }

  async findById(id: string) {
    return this.prisma.player.findUnique({
      where: { id },
    });
  }

  async createPlayer(data: {
    name: string;
    country: string;
    isOverseas: boolean;
    role: string;
    battingStyle?: string;
    bowlingStyle?: string;
    tier?: string;
    basePrice: number;
    image?: string;
    stats?: any;
  }) {
    return this.prisma.player.create({
      data: {
        name: data.name,
        country: data.country,
        isOverseas: data.isOverseas,
        role: data.role.toUpperCase(),
        battingStyle: data.battingStyle,
        bowlingStyle: data.bowlingStyle,
        tier: data.tier || 'CAPPED',
        basePrice: data.basePrice,
        image: data.image,
        stats: data.stats ? (typeof data.stats === 'string' ? data.stats : JSON.stringify(data.stats)) : null,
      },
    });
  }
}

