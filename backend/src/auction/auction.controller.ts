import { Controller, Get, Post, Param, Body, Req, UseGuards, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuctionEngine } from './auction.engine.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { NominatePlayerDto, PlaceBidDto, SetSpeedDto } from './dto/auction-action.dto.js';

@Controller('api/auction')
export class AuctionController {
  constructor(
    private readonly auctionEngine: AuctionEngine,
    private readonly prisma: PrismaService,
  ) {}

  private async assertRoomAccess(roomId: string, userId: string): Promise<void> {
    const member = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: { roomId, userId },
      },
    });

    if (!member) {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: { id: true, hostId: true },
      });

      if (!room) {
        throw new NotFoundException('Room not found');
      }

      if (room.hostId !== userId) {
        throw new ForbiddenException('Access denied: You must be a member of this room to view its auction data');
      }
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get(':roomId/audit-logs')
  async getAuditLogs(@Req() req: any, @Param('roomId') roomId: string) {
    const userId = req.user?.sub;
    await this.assertRoomAccess(roomId, userId);
    return this.prisma.auctionAuditLog.findMany({
      where: { roomId },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get(':roomId/bids/:auctionPlayerId')
  async getPlayerBids(
    @Req() req: any,
    @Param('roomId') roomId: string,
    @Param('auctionPlayerId') auctionPlayerId: string,
  ) {
    const userId = req.user?.sub;
    await this.assertRoomAccess(roomId, userId);
    return this.prisma.bid.findMany({
      where: { roomId, auctionPlayerId },
      include: {
        team: true,
        bidder: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/nominate')
  async nominatePlayer(
    @Req() req: any,
    @Param('roomId') roomId: string,
    @Body() body: NominatePlayerDto,
  ) {
    return this.auctionEngine.nominatePlayer(roomId, req.user.sub, body.auctionPlayerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/bid')
  async placeBid(
    @Req() req: any,
    @Param('roomId') roomId: string,
    @Body() body: PlaceBidDto,
  ) {
    return this.auctionEngine.placeBid(roomId, req.user.sub, body.teamId, body.amount);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/start')
  async startAuction(@Req() req: any, @Param('roomId') roomId: string) {
    return this.auctionEngine.startAuction(roomId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/pause')
  async pauseAuction(@Req() req: any, @Param('roomId') roomId: string) {
    return this.auctionEngine.pauseAuction(roomId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/resume')
  async resumeAuction(@Req() req: any, @Param('roomId') roomId: string) {
    return this.auctionEngine.resumeAuction(roomId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/skip')
  async skipPlayer(@Req() req: any, @Param('roomId') roomId: string) {
    return this.auctionEngine.skipPlayer(roomId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/undo')
  async undoLastAction(@Req() req: any, @Param('roomId') roomId: string) {
    return this.auctionEngine.undoLastAction(roomId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/end')
  async endAuction(@Req() req: any, @Param('roomId') roomId: string) {
    return this.auctionEngine.endAuction(roomId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':roomId/speed')
  async setAuctionSpeed(
    @Req() req: any,
    @Param('roomId') roomId: string,
    @Body() body: SetSpeedDto,
  ) {
    return this.auctionEngine.setAuctionSpeed(roomId, req.user.sub, body.speedMultiplier);
  }
}

