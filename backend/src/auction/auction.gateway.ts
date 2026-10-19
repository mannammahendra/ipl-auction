import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuctionEngine } from './auction.engine.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoomsService } from '../rooms/rooms.service.js';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class AuctionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AuctionGateway.name);
  private activeSockets = new Map<string, { userId: string; roomId?: string }>();
  private userRoomSockets = new Map<string, Set<string>>(); // key: `${roomId}:${userId}` -> Set of socket IDs
  private lastBidTimePerUser = new Map<string, number>(); // userId -> timestamp of last bid
  private roomMessages = new Map<string, Array<{
    id: string;
    roomId: string;
    userId: string;
    username: string;
    avatar?: string | null;
    teamId?: string | null;
    teamName?: string | null;
    teamShortName?: string | null;
    teamColor?: string | null;
    teamLogo?: string | null;
    text: string;
    timestamp: number;
  }>>();
  private voiceParticipants = new Map<string, Map<string, {
    userId: string;
    socketId: string;
    username: string;
    teamShortName?: string | null;
    teamColor?: string | null;
    isMuted: boolean;
    isSpeaking: boolean;
  }>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly auctionEngine: AuctionEngine,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => RoomsService))
    private readonly roomsService: RoomsService,
  ) {}

  afterInit() {
    this.logger.log('Auction WebSocket Gateway Initialized');
    this.auctionEngine.setBroadcastCallback((event: string, roomId: string, payload: any) => {
      this.server.to(`room:${roomId}`).emit(event, payload);
    });
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.query?.token as string) ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client connected without token: ${client.id}`);
        client.emit('auth_error', { message: 'Authentication required' });
        return;
      }

      const payload = this.jwtService.verify(token);
      this.activeSockets.set(client.id, { userId: payload.sub });
      this.logger.log(`User connected: ${payload.username} (${client.id})`);
    } catch (err: any) {
      this.logger.error(`Socket auth failed: ${err.message}`);
      client.emit('auth_error', { message: 'Invalid or expired token' });
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const session = this.activeSockets.get(client.id);
    if (session && session.roomId) {
      const roomVoice = this.voiceParticipants.get(session.roomId);
      if (roomVoice && roomVoice.has(client.id)) {
        roomVoice.delete(client.id);
        this.server.to(`room:${session.roomId}`).emit('voice_user_left', {
          socketId: client.id,
          userId: session.userId,
        });
      }

      const userRoomKey = `${session.roomId}:${session.userId}`;
      const socketSet = this.userRoomSockets.get(userRoomKey);
      if (socketSet) {
        socketSet.delete(client.id);
      }

      const hasRemainingSockets = socketSet && socketSet.size > 0;

      if (!hasRemainingSockets) {
        this.userRoomSockets.delete(userRoomKey);

        this.server.to(`room:${session.roomId}`).emit('user_left', {
          userId: session.userId,
          socketId: client.id,
        });

        await this.prisma.roomMember.updateMany({
          where: { roomId: session.roomId, userId: session.userId },
          data: { isOnline: false, socketId: null },
        });
        this.logger.log(`User ${session.userId} went offline in room ${session.roomId} (all tabs closed)`);
      } else {
        const remainingSocketId = Array.from(socketSet)[0];
        await this.prisma.roomMember.updateMany({
          where: { roomId: session.roomId, userId: session.userId },
          data: { socketId: remainingSocketId, isOnline: true },
        });
        this.logger.log(`User ${session.userId} closed socket ${client.id} but remains ONLINE via ${socketSet.size} active socket(s) in room ${session.roomId}`);
      }
    }
    this.activeSockets.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) {
      client.emit('error', { message: 'Unauthenticated socket' });
      return;
    }

    const { roomId } = data;
    const room = await this.prisma.room.findFirst({
      where: {
        OR: [{ id: roomId }, { code: roomId.toUpperCase() }],
      },
      include: {
        host: { select: { id: true, username: true } },
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

    if (!room) {
      client.emit('error', { message: 'Room not found' });
      return;
    }

    const actualRoomId = room.id;
    session.roomId = actualRoomId;
    client.join(`room:${actualRoomId}`);

    // Register active socket for this user and room
    const userRoomKey = `${actualRoomId}:${session.userId}`;
    const socketSet = this.userRoomSockets.get(userRoomKey) || new Set<string>();
    socketSet.add(client.id);
    this.userRoomSockets.set(userRoomKey, socketSet);

    // Ensure member exists so user is never rejected when bidding
    let member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: actualRoomId, userId: session.userId } },
    });

    if (!member) {
      let userExists = await this.prisma.user.findUnique({ where: { id: session.userId } });
      if (!userExists) {
        userExists = await this.prisma.user.create({
          data: {
            id: session.userId,
            username: `Manager_${session.userId.slice(0, 4)}`,
            isGuest: true,
          },
        });
      }
      member = await this.prisma.roomMember.create({
        data: {
          roomId: actualRoomId,
          userId: session.userId,
          isHost: room.hostId === session.userId,
          isOnline: true,
          socketId: client.id,
        },
      });
    } else {
      await this.prisma.roomMember.update({
        where: { id: member.id },
        data: { isOnline: true, socketId: client.id },
      });
    }

    let currentAuctionPlayer: any = null;
    let currentBids: any[] = [];
    if (room.currentAuctionPlayerId) {
      currentAuctionPlayer = await this.prisma.auctionPlayer.findUnique({
        where: { id: room.currentAuctionPlayerId },
        include: { player: true },
      });

      if (currentAuctionPlayer && currentAuctionPlayer.status !== 'NOMINATED') {
        currentAuctionPlayer = null;
      }

      if (currentAuctionPlayer) {
        currentBids = await this.prisma.bid.findMany({
          where: { roomId: actualRoomId, auctionPlayerId: room.currentAuctionPlayerId },
          include: {
            team: true,
            bidder: { select: { id: true, username: true } },
          },
          orderBy: { amount: 'desc' },
          take: 20,
        });
      }
    }

    const timerState = this.auctionEngine.getTimerState(actualRoomId);
    const roomVoice = this.voiceParticipants.get(actualRoomId);
    const currentVoiceUsers = roomVoice ? Array.from(roomVoice.values()) : [];

    client.emit('room_sync', {
      room,
      currentAuctionPlayer,
      currentBids,
      timerState,
      recentMessages: this.roomMessages.get(actualRoomId) || [],
      voiceParticipants: currentVoiceUsers,
      serverTime: Date.now(),
    });

    this.server.to(`room:${actualRoomId}`).emit('user_joined', {
      userId: session.userId,
      socketId: client.id,
    });
  }

  @SubscribeMessage('place_bid')
  async handlePlaceBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; teamId: string; amount?: number },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) {
      client.emit('bid_error', { message: 'Unauthenticated' });
      return;
    }

    // Rate-limit bidding: Max 1 bid per 250ms per user
    const now = Date.now();
    const lastBid = this.lastBidTimePerUser.get(session.userId) || 0;
    if (now - lastBid < 250) {
      client.emit('bid_error', { message: 'Bidding too fast. Please wait a moment.' });
      return;
    }
    this.lastBidTimePerUser.set(session.userId, now);

    try {
      const result = await this.auctionEngine.placeBid(
        data.roomId,
        session.userId,
        data.teamId,
        data.amount,
      );
      client.emit('bid_success', result);
    } catch (err: any) {
      client.emit('bid_error', { message: err.message });
    }
  }

  @SubscribeMessage('start_auction')
  async handleStartAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.startAuction(data.roomId, session.userId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('nominate_player')
  async handleNominatePlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; auctionPlayerId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.nominatePlayer(data.roomId, session.userId, data.auctionPlayerId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('nominate_next')
  async handleNominateNext(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.verifyHost(data.roomId, session.userId);
      await this.auctionEngine.nominateNextUpcomingPlayer(data.roomId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('timer_expired')
  async handleTimerExpired(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; lotId?: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session || !data?.roomId) return;
    try {
      await this.auctionEngine.handleZeroCountdown(data.roomId, data.lotId);
    } catch (err: any) {
      this.logger.warn(`Error in handleTimerExpired: ${err?.message}`);
    }
  }

  @SubscribeMessage('pause_auction')
  async handlePauseAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.pauseAuction(data.roomId, session.userId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('resume_auction')
  async handleResumeAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.resumeAuction(data.roomId, session.userId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('sell_now')
  async handleSellNow(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.sellNow(data.roomId, session.userId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('mark_unsold')
  async handleMarkUnsold(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.markUnsoldNow(data.roomId, session.userId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('skip_player')
  async handleSkipPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.skipPlayer(data.roomId, session.userId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('undo_action')
  async handleUndoAction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.undoLastAction(data.roomId, session.userId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('end_auction')
  async handleEndAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.endAuction(data.roomId, session.userId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('start_accelerated_round')
  async handleStartAcceleratedRound(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; timerSeconds?: number },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.startAcceleratedRound(data.roomId, session.userId, data.timerSeconds);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('set_auction_speed')
  async handleSetAuctionSpeed(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; speedMultiplier?: number },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.setAuctionSpeed(data.roomId, session.userId, data.speedMultiplier);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('select_team')
  async handleSelectTeam(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; teamId: string; managerName?: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      const room = await this.roomsService.selectTeam(
        data.roomId,
        session.userId,
        data.teamId,
        data.managerName,
      );
      client.emit('team_selected_success', { room });
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('recall_player')
  async handleRecallPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; auctionPlayerId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session) return;
    try {
      await this.auctionEngine.recallPlayer(data.roomId, session.userId, data.auctionPlayerId);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; text: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session || !data?.text?.trim() || !data?.roomId) return;

    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: data.roomId, userId: session.userId } },
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        team: { select: { id: true, name: true, shortName: true, color: true, logo: true } },
      },
    });

    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      roomId: data.roomId,
      userId: session.userId,
      username: member?.user?.username || 'Manager',
      avatar: member?.user?.avatar,
      teamId: member?.team?.id,
      teamName: member?.team?.name,
      teamShortName: member?.team?.shortName,
      teamColor: member?.team?.color,
      teamLogo: member?.team?.logo,
      text: data.text.trim(),
      timestamp: Date.now(),
    };

    if (!this.roomMessages.has(data.roomId)) {
      this.roomMessages.set(data.roomId, []);
    }
    const msgs = this.roomMessages.get(data.roomId)!;
    msgs.push(msg);
    if (msgs.length > 80) msgs.shift();

    this.server.to(`room:${data.roomId}`).emit('new_message', msg);
  }

  @SubscribeMessage('voice_join')
  async handleVoiceJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session || !data?.roomId) return;

    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: data.roomId, userId: session.userId } },
      include: {
        user: { select: { id: true, username: true } },
        team: { select: { shortName: true, color: true } },
      },
    });

    if (!this.voiceParticipants.has(data.roomId)) {
      this.voiceParticipants.set(data.roomId, new Map());
    }
    const roomVoice = this.voiceParticipants.get(data.roomId)!;

    const existingPeers = Array.from(roomVoice.values());

    const newParticipant = {
      userId: session.userId,
      socketId: client.id,
      username: member?.user?.username || 'Manager',
      teamShortName: member?.team?.shortName,
      teamColor: member?.team?.color,
      isMuted: false,
      isSpeaking: false,
    };

    roomVoice.set(client.id, newParticipant);

    client.emit('voice_joined', { peers: existingPeers });
    client.to(`room:${data.roomId}`).emit('voice_user_joined', newParticipant);
  }

  @SubscribeMessage('voice_leave')
  async handleVoiceLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session || !data?.roomId) return;

    const roomVoice = this.voiceParticipants.get(data.roomId);
    if (roomVoice && roomVoice.has(client.id)) {
      roomVoice.delete(client.id);
      this.server.to(`room:${data.roomId}`).emit('voice_user_left', {
        socketId: client.id,
        userId: session.userId,
      });
    }
  }

  @SubscribeMessage('voice_signal')
  async handleVoiceSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { toSocketId: string; signal: any },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session || !data?.toSocketId) return;

    this.server.to(data.toSocketId).emit('voice_signal', {
      fromSocketId: client.id,
      signal: data.signal,
      userId: session.userId,
    });
  }

  @SubscribeMessage('voice_state')
  async handleVoiceState(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isMuted?: boolean; isSpeaking?: boolean },
  ) {
    const session = this.activeSockets.get(client.id);
    if (!session || !data?.roomId) return;

    const roomVoice = this.voiceParticipants.get(data.roomId);
    if (roomVoice && roomVoice.has(client.id)) {
      const p = roomVoice.get(client.id)!;
      if (typeof data.isMuted === 'boolean') p.isMuted = data.isMuted;
      if (typeof data.isSpeaking === 'boolean') p.isSpeaking = data.isSpeaking;

      this.server.to(`room:${data.roomId}`).emit('voice_state_changed', {
        socketId: client.id,
        userId: session.userId,
        isMuted: p.isMuted,
        isSpeaking: p.isSpeaking,
      });
    }
  }
}
