import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { calculateNextValidBid as calcNextBid } from '../constants/auctionRules.js';

interface LockWaiter {
  resolve: () => void;
  reject: (err: any) => void;
  timer: NodeJS.Timeout;
}

export class RoomMutex {
  private locked = false;
  private queue: LockWaiter[] = [];

  async acquire(timeoutMs = 15000): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.release();
        }
      };
    }

    return new Promise<() => void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex((w) => w.timer === timer);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        reject(new Error(`Room lock acquisition timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.queue.push({
        resolve: () => {
          clearTimeout(timer);
          let released = false;
          resolve(() => {
            if (!released) {
              released = true;
              this.release();
            }
          });
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
        timer,
      });
    });
  }

  private release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next.resolve();
    } else {
      this.locked = false;
    }
  }

  isIdle(): boolean {
    return !this.locked && this.queue.length === 0;
  }
}

export interface ActiveAuctionTimer {
  roomId: string;
  intervalRef: any;
  nextLotTimeoutRef?: any;
  timerEndsAt: number;
  remainingSeconds: number;
  totalSeconds: number;
  isPaused: boolean;
  pauseRemainingMs?: number;
  speedMultiplier?: number;
  isTransitioning?: boolean;
  transitionStartedAt?: number;
  lotId?: string | null;
  generation?: number;
}

@Injectable()
export class AuctionEngine implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AuctionEngine.name);
  private timers = new Map<string, ActiveAuctionTimer>();
  private roomMutexes = new Map<string, RoomMutex>();
  private lockStorage = new AsyncLocalStorage<Set<string>>();
  private timerGenerations = new Map<string, number>();
  private roomSpeeds = new Map<string, number>();
  private broadcastCallback?: (event: string, roomId: string, payload: any) => void;
  private watchdogIntervalRef: any = null;
  private isWatchdogRunning = false;

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    this.logger.log('AuctionEngine initializing - reconciling active auctions and starting liveness watchdog...');
    try {
      await this.reconcileActiveAuctions();
    } catch (err: any) {
      this.logger.error(`Error during auction reconciliation on bootstrap: ${err?.message}`, err?.stack);
    }
    this.startWatchdog();
  }

  onModuleDestroy() {
    if (this.watchdogIntervalRef) {
      clearInterval(this.watchdogIntervalRef);
      this.watchdogIntervalRef = null;
    }
    for (const [roomId] of this.timers) {
      this.clearTimer(roomId);
    }
  }

  startWatchdog() {
    if (this.watchdogIntervalRef) return;
    this.watchdogIntervalRef = setInterval(async () => {
      if (this.isWatchdogRunning) return;
      this.isWatchdogRunning = true;
      try {
        await this.runLivenessWatchdogCheck();
      } catch (err: any) {
        this.logger.error(`Error in liveness watchdog: ${err?.message}`);
      } finally {
        this.isWatchdogRunning = false;
      }
    }, 4000);
  }

  async runLivenessWatchdogCheck() {
    const activeRooms = await this.prisma.room.findMany({
      where: { status: 'AUCTION_ACTIVE', isPaused: false },
      select: {
        id: true,
        currentAuctionPlayerId: true,
        timerEndsAt: true,
        bidTimerSeconds: true,
        updatedAt: true,
      },
    });

    if (activeRooms.length === 0) return;

    const now = Date.now();

    for (const room of activeRooms) {
      try {
        const activeTimer = this.timers.get(room.id);
        const speed = this.roomSpeeds.get(room.id) || 1.0;

        if (room.currentAuctionPlayerId) {
          const endsAt = room.timerEndsAt ? room.timerEndsAt.getTime() : 0;
          const graceMs = Math.max(1000, Math.round(2000 / speed));

          if (endsAt > 0 && now >= endsAt + graceMs) {
            this.logger.warn(`[Watchdog] Room ${room.id} lot ${room.currentAuctionPlayerId} expired at ${new Date(endsAt).toISOString()} but remained unfinalized. Self-healing...`);
            await this.completeLotWithRetry(room.id, this.timerGenerations.get(room.id) || 0, room.currentAuctionPlayerId);
          } else if (!activeTimer || (!activeTimer.intervalRef && !activeTimer.isPaused && !activeTimer.isTransitioning)) {
            // Unmonitored lot: check if deadline has already passed
            if (endsAt > 0 && now >= endsAt) {
              this.logger.warn(`[Watchdog] Unmonitored expired lot in room ${room.id}. Finalizing lot now.`);
              await this.completeLotWithRetry(room.id, this.timerGenerations.get(room.id) || 0, room.currentAuctionPlayerId);
            } else {
              const remainingSec = endsAt > 0
                ? Math.max(1, Math.ceil(((endsAt - now) * speed) / 1000))
                : room.bidTimerSeconds;
              this.logger.log(`[Watchdog] Rescuing unmonitored lot in room ${room.id}. Resuming countdown with ${remainingSec}s.`);
              this.startTimer(room.id, remainingSec, room.currentAuctionPlayerId);
            }
          }
        } else {
          const transitionAgeMs = activeTimer?.transitionStartedAt ? now - activeTimer.transitionStartedAt : 0;
          const isStuckTransition = activeTimer?.isTransitioning && transitionAgeMs > 6000;
          if ((!activeTimer?.nextLotTimeoutRef && !activeTimer?.isTransitioning) || isStuckTransition) {
            this.logger.warn(`[Watchdog] Room ${room.id} active with empty stage. Triggering next player nomination.`);
            await this.nominateNextUpcomingPlayer(room.id);
          }
        }
      } catch (err: any) {
        this.logger.error(`[Watchdog] Failed check on room ${room.id}: ${err?.message}`);
      }
    }
  }

  async recoverRoomFromStall(roomId: string) {
    this.logger.warn(`[Recovery] Attempting emergency recovery for stalled room ${roomId}...`);
    try {
      await this.withLock(roomId, async () => {
        const room = await this.prisma.room.findUnique({
          where: { id: roomId },
          include: { teams: true },
        });
        if (!room || room.status !== 'AUCTION_ACTIVE') return;

        this.clearTimer(roomId);

        if (room.currentAuctionPlayerId) {
          const ap = await this.prisma.auctionPlayer.findUnique({
            where: { id: room.currentAuctionPlayerId },
          });

          if (ap && ap.status === 'NOMINATED') {
            this.logger.log(`[Recovery] Room ${roomId}: Finalizing stuck lot ${ap.id}`);
            await this.handleLotCompletionInternal(roomId, undefined, ap.id);
            return;
          }
        }

        this.logger.log(`[Recovery] Room ${roomId}: Triggering next upcoming player nomination.`);
        await this.nominateNextUpcomingPlayerInternal(roomId);
      });
    } catch (err: any) {
      this.logger.error(`[Recovery] Emergency recovery for room ${roomId} encountered error: ${err?.message}`);
    }
  }



  async reconcileActiveAuctions() {
    const activeRooms = await this.prisma.room.findMany({
      where: { status: 'AUCTION_ACTIVE' },
    });

    if (activeRooms.length === 0) {
      this.logger.log('No active auctions to reconcile on startup.');
      return;
    }

    this.logger.log(`Found ${activeRooms.length} active auction rooms to reconcile on startup.`);

    const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    for (const room of activeRooms) {
      try {
        const isStale = room.updatedAt && now - room.updatedAt.getTime() > STALE_THRESHOLD_MS;

        if (room.isPaused || isStale) {
          if (isStale && !room.isPaused) {
            this.logger.log(`Room ${room.id} has been inactive for >30m; automatically pausing to conserve resources.`);
            await this.prisma.room.update({
              where: { id: room.id },
              data: { isPaused: true },
            });
          } else {
            this.logger.log(`Room ${room.id} is paused; restoring paused state.`);
          }
          this.timers.set(room.id, {
            roomId: room.id,
            intervalRef: null,
            nextLotTimeoutRef: null,
            timerEndsAt: 0,
            remainingSeconds: room.bidTimerSeconds,
            totalSeconds: room.bidTimerSeconds,
            isPaused: true,
            isTransitioning: false,
          });
          continue;
        }

        let nominatedPlayer = room.currentAuctionPlayerId
          ? await this.prisma.auctionPlayer.findUnique({
              where: { id: room.currentAuctionPlayerId },
              include: { player: true },
            })
          : null;

        if (!nominatedPlayer || nominatedPlayer.status !== 'NOMINATED') {
          nominatedPlayer = await this.prisma.auctionPlayer.findFirst({
            where: { roomId: room.id, status: 'NOMINATED' },
            include: { player: true },
          });
        }

        if (nominatedPlayer && nominatedPlayer.status === 'NOMINATED') {
          const endsAt = room.timerEndsAt ? room.timerEndsAt.getTime() : 0;

          if (endsAt > 0 && endsAt <= now) {
            this.logger.log(
              `Auction timer expired during downtime for room ${room.id} (ended at ${new Date(endsAt).toISOString()}). Finalizing lot ${nominatedPlayer.id}.`
            );
            await this.handleLotCompletion(room.id);
          } else {
            const remainingSec = endsAt > 0
              ? Math.max(1, Math.ceil((endsAt - now) / 1000))
              : room.bidTimerSeconds;
            this.logger.log(`Resuming countdown timer for room ${room.id} with ${remainingSec}s remaining.`);
            this.startTimer(room.id, remainingSec, nominatedPlayer.id);
          }
        } else {
          this.logger.log(`Room ${room.id} active with no nominated lot. Triggering nomination of next upcoming player.`);
          await this.nominateNextUpcomingPlayer(room.id);
        }
      } catch (err: any) {
        this.logger.error(`Failed to reconcile active room ${room.id}: ${err?.message}`, err?.stack);
      }
    }
  }

  async verifyHost(roomId: string, userId: string) {
    const room = await this.prisma.room.findFirst({
      where: {
        OR: [{ id: roomId }, { code: roomId.toUpperCase() }],
      },
      include: { members: { include: { user: true } } },
    });
    if (!room) throw new NotFoundException('Room not found');
    const isHost = room.hostId === userId || room.members?.some((m) => m.userId === userId && m.isHost);
    if (!isHost) throw new ForbiddenException('Unauthorized: Only room host can perform this action');
    return room;
  }

  setBroadcastCallback(cb: (event: string, roomId: string, payload: any) => void) {
    this.broadcastCallback = cb;
  }

  public broadcast(event: string, roomId: string, payload: any) {
    if (this.broadcastCallback) {
      this.broadcastCallback(event, roomId, payload);
    }
  }

  private async acquireLock(roomId: string, timeoutMs = 15000): Promise<() => void> {
    const currentLocks = this.lockStorage.getStore();
    if (currentLocks && currentLocks.has(roomId)) {
      return () => {};
    }

    let mutex = this.roomMutexes.get(roomId);
    if (!mutex) {
      mutex = new RoomMutex();
      this.roomMutexes.set(roomId, mutex);
    }

    const release = await mutex.acquire(timeoutMs);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        release();
        if (mutex.isIdle()) {
          this.roomMutexes.delete(roomId);
        }
      }
    };
  }

  public async withLock<T>(roomId: string, action: () => Promise<T>, timeoutMs = 15000): Promise<T> {
    const currentLocks = this.lockStorage.getStore();
    if (currentLocks && currentLocks.has(roomId)) {
      return await action();
    }

    const release = await this.acquireLock(roomId, timeoutMs);
    const newLocks = new Set(currentLocks || []);
    newLocks.add(roomId);

    try {
      return await this.lockStorage.run(newLocks, action);
    } finally {
      release();
    }
  }

  calculateNextValidBid(currentBid: number, basePrice: number): { nextBid: number; increment: number } {
    return calcNextBid(currentBid, basePrice);
  }

  async startAuction(roomId: string, hostUserId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);

      // If auction is already running, resume next player if podium is empty
      if (room.status === 'AUCTION_ACTIVE') {
        if (!room.currentAuctionPlayerId) {
          await this.nominateNextUpcomingPlayerInternal(room.id);
        }
        return { success: true, message: 'Auction is already active' };
      }

      // Check if room has auctionPlayers; if empty, copy from global Player catalog
      const totalAuctionPlayers = await this.prisma.auctionPlayer.count({
        where: { roomId: room.id },
      });
      if (totalAuctionPlayers === 0) {
        const globalPlayers = await this.prisma.player.findMany({
          orderBy: { basePrice: 'desc' },
        });
        if (globalPlayers.length > 0) {
          await this.prisma.auctionPlayer.createMany({
            data: globalPlayers.map((p, idx) => ({
              roomId: room.id,
              playerId: p.id,
              status: 'UPCOMING',
              lotNumber: idx + 1,
              round: 1,
            })),
          });
        }
      }

      await this.prisma.room.update({
        where: { id: room.id },
        data: { status: 'AUCTION_ACTIVE', isPaused: false },
      });

      this.broadcast('auction_started', room.id, {
        roomId: room.id,
        status: 'AUCTION_ACTIVE',
        message: 'The Grand IPL Auction has officially begun!',
      });

      const firstPlayer = await this.prisma.auctionPlayer.findFirst({
        where: { roomId: room.id, status: 'UPCOMING' },
        orderBy: { lotNumber: 'asc' },
      });

      if (firstPlayer) {
        await this.nominatePlayerInternal(room.id, firstPlayer.id);
      } else {
        await this.nominateNextUpcomingPlayerInternal(room.id);
      }

      return { success: true };
    });
  }

  async nominatePlayer(roomId: string, hostUserId: string, auctionPlayerId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      return await this.nominatePlayerInternal(room.id, auctionPlayerId);
    });
  }

  private async nominatePlayerInternal(roomId: string, auctionPlayerId: string) {
    this.clearTimer(roomId);

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new BadRequestException('Invalid room');
    if (room.isPaused) throw new BadRequestException('Cannot nominate a player while the auction is paused');

    const updatedAuctionPlayer = await this.prisma.auctionPlayer.update({
      where: { id: auctionPlayerId },
      data: {
        status: 'NOMINATED',
        nominatedAt: new Date(),
      },
      include: { player: true },
    });

    const speed = this.roomSpeeds.get(roomId) || 1.0;
    const timerEndsAt = new Date(Date.now() + Math.round((room.bidTimerSeconds * 1000) / speed));

    await this.prisma.room.update({
      where: { id: roomId },
      data: {
        status: 'AUCTION_ACTIVE',
        currentAuctionPlayerId: updatedAuctionPlayer.id,
        currentBidAmount: 0,
        currentBidTeamId: null,
        timerEndsAt,
        isPaused: room.isPaused,
      },
    });

    // Asynchronously record nomination audit log without blocking real-time broadcast
    this.prisma.auctionAuditLog.create({
      data: {
        roomId,
        action: 'PLAYER_NOMINATED',
        details: JSON.stringify({
          playerId: updatedAuctionPlayer.playerId,
          playerName: updatedAuctionPlayer.player.name,
          basePrice: updatedAuctionPlayer.player.basePrice,
          role: updatedAuctionPlayer.player.role,
        }),
      },
    }).catch((err) => this.logger.warn(`Async audit log error: ${err?.message}`));

    const payload = {
      auctionPlayer: updatedAuctionPlayer,
      currentBidAmount: 0,
      currentBidTeamId: null,
      currentBidTeam: null,
      timerSeconds: room.bidTimerSeconds,
      timerEndsAt,
      serverTime: Date.now(),
    };

    this.broadcast('player_nominated', roomId, payload);
    if (!room.isPaused) {
      this.startTimer(roomId, room.bidTimerSeconds, updatedAuctionPlayer.id);
    }

    return payload;
  }

  async placeBid(roomId: string, userId: string, teamId: string, customAmount?: number) {
    return await this.withLock(roomId, async () => {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        include: {
          teams: { include: { squad: true } },
        },
      });

      if (!room) throw new BadRequestException('Room not found');
      if (room.status !== 'AUCTION_ACTIVE') throw new BadRequestException('Auction is not currently active');
      if (room.isPaused) throw new BadRequestException('Auction is paused by host');
      if (!room.currentAuctionPlayerId) throw new BadRequestException('No player is currently on the auction podium');

      const auctionPlayer = await this.prisma.auctionPlayer.findUnique({
        where: { id: room.currentAuctionPlayerId },
        include: { player: true },
      });

      if (!auctionPlayer || auctionPlayer.status !== 'NOMINATED') {
        throw new BadRequestException('Current player is not open for bidding');
      }

      let team = room.teams.find((t) => t.id === teamId);
      if (!team) throw new BadRequestException('Team not found in this room');

      let member = await this.prisma.roomMember.findUnique({
        where: { roomId_userId: { roomId, userId } },
        include: { user: true },
      });

      if (!member) {
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
            roomId,
            userId,
            isHost: room.hostId === userId,
            isOnline: true,
          },
          include: { user: true },
        });
      }

      // Auto-assign member to this team if they haven't selected a team yet and it's available
      if (!member.teamId) {
        const takenByOther = await this.prisma.roomMember.findFirst({
          where: { roomId, teamId: team.id, userId: { not: userId } },
        });
        if (!takenByOther) {
          member = await this.prisma.roomMember.update({
            where: { id: member.id },
            data: { teamId: team.id },
            include: { user: true },
          });

          // Broadcast room_sync & team_selected so other users immediately see the claim
          const freshRoom = await this.prisma.room.findUnique({
            where: { id: roomId },
            include: {
              teams: { include: { squad: { include: { player: true } } } },
              members: { include: { user: true, team: true } },
              auctionPlayers: { include: { player: true } },
            },
          });
          if (freshRoom) {
            this.broadcast('room_sync', roomId, { room: freshRoom });
            this.broadcast('team_selected', roomId, {
              userId,
              username: member.user?.username || 'Manager',
              teamId: team.id,
              teamName: team.name,
              teamShortName: team.shortName,
              teamColor: team.color,
              teamLogo: team.logo,
              room: freshRoom,
              message: `👤 ${member.user?.username || 'Manager'} claimed ${team.name} (${team.shortName})`,
            });
          }
        } else {
          throw new ForbiddenException(`Team ${team.name} has already been claimed by another manager`);
        }
      } else if (member.teamId !== team.id) {
        // Fall back gracefully to the member's assigned team if valid so the bid is not blocked
        const assignedTeam = room.teams.find((t) => t.id === member!.teamId);
        if (assignedTeam) {
          team = assignedTeam;
        } else {
          throw new ForbiddenException(`You are not authorized to bid for ${team.name}`);
        }
      }

      if (room.currentBidTeamId === team.id) {
        throw new BadRequestException('Your team already holds the highest bid!');
      }

      const currentBid = room.currentBidAmount || 0;
      const { nextBid } = this.calculateNextValidBid(currentBid, auctionPlayer.player.basePrice);
      const proposedBid = customAmount ? Math.max(customAmount, nextBid) : nextBid;

      if (proposedBid < nextBid) {
        throw new BadRequestException(`Bid must be at least ₹${(nextBid / 10000000).toFixed(2)} Cr`);
      }

      if (proposedBid > team.currentPurse) {
        throw new BadRequestException(
          `Insufficient purse! You have ₹${(team.currentPurse / 10000000).toFixed(2)} Cr available.`,
        );
      }

      const currentSquadCount = Math.max(team.squad?.length || 0, team.totalPlayers || 0);

      if (currentSquadCount >= room.maxSquad) {
        throw new BadRequestException(
          `Squad complete! Your franchise has already bought all required ${room.maxSquad} players. You cannot place any more bids.`,
        );
      }

      if (auctionPlayer.player.isOverseas && team.overseasCount >= room.maxOverseas) {
        throw new BadRequestException(
          `Overseas quota reached! You already have ${team.overseasCount}/${room.maxOverseas} overseas players (cannot buy ${team.overseasCount + 1}th overseas player). You can only bid on Indian players.`,
        );
      }

      const remainingSlotsToMin = Math.max(0, room.minSquad - (currentSquadCount + 1));
      // Base reserve: official uncapped base price is 20 Lakhs; scale down for smaller purse custom rooms
      const minPerSlot = Math.min(2000000, Math.max(500000, Math.floor(room.startingPurse / (room.maxSquad * 2))));
      const requiredReserve = remainingSlotsToMin * minPerSlot;
      const remainingPurseAfterBid = team.currentPurse - proposedBid;

      if (remainingPurseAfterBid < requiredReserve) {
        throw new BadRequestException(
          `Compulsory squad reserve: You must keep at least ₹${(requiredReserve / 10000000).toFixed(2)} Cr to complete your mandatory squad of ${room.minSquad} players.`,
        );
      }

      const activeTimer = this.timers.get(roomId);
      // If a player bids, the timer starts from the starting (timer set by the host)
      const startingTimer = room.bidTimerSeconds || 14;
      const remaining = startingTimer;
      const speed = this.roomSpeeds.get(roomId) || 1.0;
      const timerEndsAt = new Date(Date.now() + Math.round((remaining * 1000) / speed));

      // Ultra-fast parallel database execution for immediate bid placement
      const [bid] = await Promise.all([
        this.prisma.bid.create({
          data: {
            roomId,
            auctionPlayerId: auctionPlayer.id,
            teamId: team.id,
            bidderUserId: userId,
            amount: proposedBid,
            bidNumber: (room.currentBidAmount ? 2 : 1),
          },
          include: {
            team: true,
            bidder: { select: { id: true, username: true } },
          },
        }),
        this.prisma.room.update({
          where: { id: roomId },
          data: {
            currentBidAmount: proposedBid,
            currentBidTeamId: team.id,
            timerEndsAt,
            lastBidTime: new Date(),
          },
        }),
      ]);

      // Fire audit log asynchronously to never delay real-time bid propagation
      this.prisma.auctionAuditLog.create({
        data: {
          roomId,
          action: 'BID_PLACED',
          details: JSON.stringify({
            team: team.name,
            shortName: team.shortName,
            amount: proposedBid,
            bidder: member.user?.username || userId,
          }),
        },
      }).catch((err) => this.logger.warn(`Async audit log error: ${err?.message}`));

      const broadcastData = {
        bid,
        team,
        bidderName: member.user?.username || userId,
        amount: proposedBid,
        timerSeconds: remaining,
        timerEndsAt,
        serverTime: Date.now(),
      };

      this.broadcast('bid_placed', roomId, broadcastData);

      if (activeTimer && activeTimer.isPaused) {
        activeTimer.remainingSeconds = remaining;
        activeTimer.totalSeconds = remaining;
        activeTimer.pauseRemainingMs = remaining * 1000;
      } else {
        this.startTimer(roomId, remaining, auctionPlayer.id);
      }

      return broadcastData;
    });
  }

  private startTimer(roomId: string, seconds: number, lotId?: string) {
    this.clearTimer(roomId);

    const currentGen = (this.timerGenerations.get(roomId) || 0) + 1;
    this.timerGenerations.set(roomId, currentGen);

    const speed = this.roomSpeeds.get(roomId) || 1.0;
    const tickIntervalMs = Math.max(250, Math.round(1000 / speed));
    const durationSeconds = Math.max(1, Math.round(seconds));
    const now = Date.now();
    const timerEndsAt = now + Math.round((durationSeconds * 1000) / speed);

    const timerObj: ActiveAuctionTimer = {
      roomId,
      intervalRef: null,
      nextLotTimeoutRef: null,
      timerEndsAt,
      remainingSeconds: durationSeconds,
      totalSeconds: durationSeconds,
      isPaused: false,
      speedMultiplier: speed,
      lotId: lotId || null,
      generation: currentGen,
    };

    // Broadcast the initial countdown tick immediately so clients receive the starting second
    this.broadcast('timer_tick', roomId, {
      remainingSeconds: durationSeconds,
      speedMultiplier: speed,
      serverTime: now,
    });

    timerObj.intervalRef = setInterval(async () => {
      // 1. Generation check: if a new timer started, self-terminate immediately
      if (this.timerGenerations.get(roomId) !== currentGen) {
        clearInterval(timerObj.intervalRef);
        return;
      }

      if (timerObj.isPaused) return;

      // 2. Authoritative deadline-based countdown (immune to event-loop lag and drift)
      const currentNow = Date.now();
      const remainingMs = timerObj.timerEndsAt - currentNow;
      const targetRemaining = Math.min(timerObj.totalSeconds, Math.max(0, Math.ceil((remainingMs * speed) / 1000)));

      const previousRemaining = timerObj.remainingSeconds;
      if (previousRemaining > targetRemaining) {
        // Sequentially emit every intermediate countdown second skipped due to interval jitter or sampling
        for (let sec = previousRemaining - 1; sec >= targetRemaining; sec--) {
          timerObj.remainingSeconds = sec;
          this.broadcast('timer_tick', roomId, {
            remainingSeconds: sec,
            speedMultiplier: speed,
            serverTime: currentNow,
          });
          if (sec <= 0) break;
        }
      }

      if (timerObj.remainingSeconds <= 0) {
        if (timerObj.isTransitioning) {
          clearInterval(timerObj.intervalRef);
          timerObj.intervalRef = null;
          return;
        }

        timerObj.isTransitioning = true;
        (timerObj as any).transitionStartedAt = Date.now();
        clearInterval(timerObj.intervalRef);
        timerObj.intervalRef = null;

        try {
          await this.completeLotWithRetry(roomId, currentGen, timerObj.lotId);
        } catch (err: any) {
          this.logger.error(`[Room: ${roomId}, Lot: ${timerObj.lotId}] Error completing lot: ${err?.message}`);
        }
      }
    }, tickIntervalMs);

    this.timers.set(roomId, timerObj);
  }

  private async completeLotWithRetry(roomId: string, expectedGen: number, expectedLotId?: string | null) {
    let completed = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.withLock(roomId, async () => {
          const currentGen = this.timerGenerations.get(roomId);
          if (expectedGen !== undefined && currentGen !== undefined && currentGen !== expectedGen) {
            this.logger.log(`[Room: ${roomId}] Timer generation changed (${expectedGen} -> ${currentGen}). Skipping stale zero completion.`);
            completed = true;
            return;
          }
          await this.handleLotCompletionInternal(roomId, expectedGen, expectedLotId);
        });
        completed = true;
        break;
      } catch (err: any) {
        this.logger.error(`[Room: ${roomId}, Attempt: ${attempt}] Failed to complete lot: ${err?.message}`);
        if (attempt < 3) {
          await new Promise((res) => setTimeout(res, 500 * attempt));
        }
      }
    }

    if (!completed) {
      this.logger.error(`[Room: ${roomId}] All attempts to complete lot failed. Triggering recovery.`);
      await this.recoverRoomFromStall(roomId);
    }
  }

  private clearTimer(roomId: string) {
    this.timerGenerations.set(roomId, (this.timerGenerations.get(roomId) || 0) + 1);

    const existing = this.timers.get(roomId);
    if (existing) {
      if (existing.intervalRef) {
        clearInterval(existing.intervalRef);
        existing.intervalRef = null;
      }
      if (existing.nextLotTimeoutRef) {
        clearTimeout(existing.nextLotTimeoutRef);
        existing.nextLotTimeoutRef = null;
      }
    }
    this.timers.delete(roomId);
  }

  async handleLotCompletion(roomId: string) {
    return await this.withLock(roomId, async () => {
      await this.handleLotCompletionInternal(roomId);
    });
  }

  private async handleLotCompletionInternal(roomId: string, expectedGen?: number, expectedLotId?: string | null) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { teams: true },
    });

    if (!room) {
      this.logger.warn(`[Room: ${roomId}] handleLotCompletion called but room not found.`);
      return;
    }

    if (room.isPaused) {
      this.logger.log(`[Room: ${roomId}] Room is paused. Skipping lot completion.`);
      return;
    }

    if (!room.currentAuctionPlayerId) {
      this.logger.warn(`[Room: ${roomId}] handleLotCompletion called but no currentAuctionPlayerId found. Proceeding to next nomination.`);
      await this.nominateNextUpcomingPlayerInternal(roomId);
      return;
    }

    if (expectedLotId && room.currentAuctionPlayerId !== expectedLotId) {
      this.logger.warn(`[Room: ${roomId}] Expected lot ${expectedLotId} but room is on ${room.currentAuctionPlayerId}. Stale completion ignored.`);
      return;
    }

    const currentGen = this.timerGenerations.get(roomId);
    if (expectedGen !== undefined && currentGen !== undefined && currentGen !== expectedGen) {
      this.logger.log(`[Room: ${roomId}] Generation superseded (${expectedGen} vs ${currentGen}). Skipping stale resolution.`);
      return;
    }

    const auctionPlayer = await this.prisma.auctionPlayer.findUnique({
      where: { id: room.currentAuctionPlayerId },
      include: { player: true },
    });

    if (!auctionPlayer) return;

    if (auctionPlayer.status !== 'NOMINATED') {
      this.logger.warn(`[Room: ${roomId}] Player ${auctionPlayer.id} already has status ${auctionPlayer.status}. Skipping duplicate resolution.`);
      return;
    }

    this.clearTimer(roomId);

    if (room.currentBidTeamId && room.currentBidAmount && room.currentBidAmount > 0) {
      const winningTeam = room.teams.find((t) => t.id === room.currentBidTeamId);
      if (!winningTeam) return;

      const soldPrice = room.currentBidAmount;

      const { squadMember } = await this.prisma.$transaction(async (tx) => {
        await tx.team.update({
          where: { id: winningTeam.id },
          data: {
            currentPurse: { decrement: soldPrice },
            totalPlayers: { increment: 1 },
            overseasCount: auctionPlayer.player.isOverseas
              ? { increment: 1 }
              : undefined,
          },
        });

        const createdSquadMember = await tx.squadMember.create({
          data: {
            teamId: winningTeam.id,
            auctionPlayerId: auctionPlayer.id,
            playerId: auctionPlayer.playerId,
            purchasePrice: soldPrice,
          },
          include: { player: true },
        });

        await tx.auctionPlayer.update({
          where: { id: auctionPlayer.id },
          data: {
            status: 'SOLD',
            soldPrice,
            soldToTeamId: winningTeam.id,
            soldAt: new Date(),
          },
        });

        await tx.room.update({
          where: { id: roomId },
          data: {
            currentAuctionPlayerId: null,
            currentBidAmount: 0,
            currentBidTeamId: null,
            timerEndsAt: null,
          },
        });

        await tx.auctionAuditLog.create({
          data: {
            roomId,
            action: 'PLAYER_SOLD',
            details: JSON.stringify({
              player: auctionPlayer.player.name,
              team: winningTeam.name,
              amount: soldPrice,
            }),
          },
        });

        return { squadMember: createdSquadMember };
      });

      this.broadcast('player_sold', roomId, {
        auctionPlayer: {
          ...auctionPlayer,
          status: 'SOLD',
          soldPrice,
          soldToTeamId: winningTeam.id,
          soldAt: new Date(),
        },
        winningTeam,
        soldPrice,
        squadMember,
        serverTime: Date.now(),
      });

      const roomState = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: { isPaused: true, status: true },
      });

      const speed = this.roomSpeeds.get(roomId) || 1.0;
      const transitionDelayMs = Math.max(500, Math.round(1800 / speed));

      if (roomState && !roomState.isPaused && roomState.status === 'AUCTION_ACTIVE') {
        const nextTimeout = setTimeout(async () => {
          try {
            await this.nominateNextUpcomingPlayer(roomId);
          } catch (err: any) {
            this.logger.error(`Error nominating next upcoming player: ${err?.message}`);
          }
        }, transitionDelayMs);
        this.timers.set(roomId, {
          roomId,
          intervalRef: null,
          nextLotTimeoutRef: nextTimeout,
          timerEndsAt: 0,
          remainingSeconds: 0,
          totalSeconds: 0,
          isPaused: false,
          isTransitioning: true,
          speedMultiplier: speed,
          transitionStartedAt: Date.now(),
        });
      } else {
        this.timers.set(roomId, {
          roomId,
          intervalRef: null,
          nextLotTimeoutRef: null,
          timerEndsAt: 0,
          remainingSeconds: 0,
          totalSeconds: 0,
          isPaused: true,
          isTransitioning: false,
        });
      }
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.auctionPlayer.update({
          where: { id: auctionPlayer.id },
          data: { status: 'UNSOLD', soldAt: new Date() },
        });

        await tx.room.update({
          where: { id: roomId },
          data: {
            currentAuctionPlayerId: null,
            currentBidAmount: 0,
            currentBidTeamId: null,
            timerEndsAt: null,
          },
        });

        await tx.auctionAuditLog.create({
          data: {
            roomId,
            action: 'PLAYER_UNSOLD',
            details: JSON.stringify({
              player: auctionPlayer.player.name,
              basePrice: auctionPlayer.player.basePrice,
            }),
          },
        });
      });

      this.broadcast('player_unsold', roomId, {
        auctionPlayer: {
          ...auctionPlayer,
          status: 'UNSOLD',
          soldAt: new Date(),
        },
        serverTime: Date.now(),
      });

      const roomState = await this.prisma.room.findUnique({
        where: { id: roomId },
        select: { isPaused: true, status: true },
      });

      const speed = this.roomSpeeds.get(roomId) || 1.0;
      const transitionDelayMs = Math.max(300, Math.round(1000 / speed));

      if (roomState && !roomState.isPaused && roomState.status === 'AUCTION_ACTIVE') {
        const nextTimeout = setTimeout(async () => {
          try {
            await this.nominateNextUpcomingPlayer(roomId);
          } catch (err: any) {
            this.logger.error(`Error nominating next upcoming player: ${err?.message}`);
          }
        }, transitionDelayMs);
        this.timers.set(roomId, {
          roomId,
          intervalRef: null,
          nextLotTimeoutRef: nextTimeout,
          timerEndsAt: 0,
          remainingSeconds: 0,
          totalSeconds: 0,
          isPaused: false,
          isTransitioning: true,
          speedMultiplier: speed,
          transitionStartedAt: Date.now(),
        });
      } else {
        this.timers.set(roomId, {
          roomId,
          intervalRef: null,
          nextLotTimeoutRef: null,
          timerEndsAt: 0,
          remainingSeconds: 0,
          totalSeconds: 0,
          isPaused: true,
          isTransitioning: false,
        });
      }
    }
  }

  async nominateNextUpcomingPlayer(roomId: string) {
    return await this.withLock(roomId, async () => {
      await this.nominateNextUpcomingPlayerInternal(roomId);
    });
  }

  private async nominateNextUpcomingPlayerInternal(roomId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room || room.isPaused || room.status !== 'AUCTION_ACTIVE') {
      this.logger.log(`Skipping auto-nomination for room ${roomId}: room is paused or not active`);
      const timer = this.timers.get(roomId);
      if (timer) timer.isTransitioning = false;
      return;
    }

    if (room.currentAuctionPlayerId) {
      const activeLot = await this.prisma.auctionPlayer.findUnique({
        where: { id: room.currentAuctionPlayerId },
      });
      if (activeLot && activeLot.status === 'NOMINATED') {
        this.logger.log(`Skipping auto-nomination for room ${roomId}: lot ${activeLot.id} already active on podium`);
        const timer = this.timers.get(roomId);
        if (timer) timer.isTransitioning = false;
        return;
      }
    }

    // Clean up any stale NOMINATED records if currentAuctionPlayerId is null
    const staleNominated = await this.prisma.auctionPlayer.findFirst({
      where: { roomId, status: 'NOMINATED' },
    });
    if (staleNominated && !room.currentAuctionPlayerId) {
      this.logger.warn(`Found stale NOMINATED player ${staleNominated.id} while room.currentAuctionPlayerId is null. Resuming this lot to podium.`);
      await this.nominatePlayerInternal(roomId, staleNominated.id);
      return;
    }

    const nextPlayer = await this.prisma.auctionPlayer.findFirst({
      where: { roomId, status: 'UPCOMING' },
      orderBy: { lotNumber: 'asc' },
    });

    if (nextPlayer) {
      await this.nominatePlayerInternal(roomId, nextPlayer.id);
      return;
    }

    // No more UPCOMING players in current pool!
    // Check franchise capacity and unsold pool
    const allTeams = await this.prisma.team.findMany({
      where: { roomId },
      include: { squad: true },
    });
    const allSquadsFull = allTeams.length > 0 && allTeams.every((t) => (t.squad?.length || 0) >= room.maxSquad);

    const unsoldPlayers = await this.prisma.auctionPlayer.findMany({
      where: { roomId, status: 'UNSOLD' },
    });

    const currentRound = room.currentRound || 1;

    if (unsoldPlayers.length > 0 && !allSquadsFull && currentRound < 5) {
      this.logger.log(`Room ${roomId}: Round ${currentRound} complete with ${unsoldPlayers.length} unsold players. Scheduling Accelerated Round.`);

      const speed = this.roomSpeeds.get(roomId) || 1.0;
      const intermissionSeconds = Math.max(2, Math.round(4 / speed));

      this.broadcast('round_completed', roomId, {
        round: currentRound,
        unsoldAvailable: unsoldPlayers.length,
        message: `Round ${currentRound} complete! ${unsoldPlayers.length} unsold players returning for Accelerated Blitz Round in ${intermissionSeconds} seconds!`,
        intermissionSeconds,
      });

      this.clearTimer(roomId);

      const intermissionTimeout = setTimeout(async () => {
        try {
          this.logger.log(`Room ${roomId}: Auto-triggering Accelerated Round ${currentRound + 1}...`);
          await this.startAcceleratedRound(roomId, room.hostId, 15);
        } catch (err: any) {
          this.logger.error(`Failed to auto-start accelerated round for room ${roomId}: ${err?.message}`);
        }
      }, intermissionSeconds * 1000);

      this.timers.set(roomId, {
        roomId,
        intervalRef: null,
        nextLotTimeoutRef: intermissionTimeout,
        timerEndsAt: Date.now() + intermissionSeconds * 1000,
        remainingSeconds: intermissionSeconds,
        totalSeconds: intermissionSeconds,
        isPaused: false,
        isTransitioning: true,
        speedMultiplier: speed,
        transitionStartedAt: Date.now(),
      });
    } else {
      await this.prisma.room.update({
        where: { id: roomId },
        data: { status: 'COMPLETED', currentAuctionPlayerId: null, timerEndsAt: null },
      });

      const timer = this.timers.get(roomId);
      if (timer) timer.isTransitioning = false;

      this.broadcast('auction_completed', roomId, {
        message: 'The IPL Mega Auction is completed! Congratulations to all franchises!',
      });
    }
  }

  async pauseAuction(roomId: string, hostUserId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      const hostMember = room.members?.find((m) => m.userId === hostUserId);
      const hostName = hostMember?.user?.username || 'Host';

      const timer = this.timers.get(room.id);
      if (timer) {
        if (timer.nextLotTimeoutRef) {
          clearTimeout(timer.nextLotTimeoutRef);
          timer.nextLotTimeoutRef = null;
          timer.isTransitioning = true;
        }
        timer.isPaused = true;
        if (timer.timerEndsAt > 0) {
          timer.pauseRemainingMs = Math.max(0, timer.timerEndsAt - Date.now());
        }
      }

      await this.prisma.room.update({
        where: { id: room.id },
        data: { isPaused: true },
      });

      const remainingSec = timer ? timer.remainingSeconds : 0;
      this.broadcast('auction_paused', room.id, {
        remainingSeconds: remainingSec,
        isPaused: true,
        hostName,
        message: `⏸️ Host (${hostName}) paused the auction`,
        serverTime: Date.now(),
      });

      return { paused: true, remainingSeconds: remainingSec, hostName };
    });
  }

  async resumeAuction(roomId: string, hostUserId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      const hostMember = room.members?.find((m) => m.userId === hostUserId);
      const hostName = hostMember?.user?.username || 'Host';

      await this.prisma.room.update({
        where: { id: room.id },
        data: { isPaused: false },
      });

      const timer = this.timers.get(room.id);
      let wasTransitioning = false;
      if (timer) {
        timer.isPaused = false;
        if (timer.isTransitioning) {
          wasTransitioning = true;
          timer.isTransitioning = false;
        } else if (timer.timerEndsAt > 0 || timer.pauseRemainingMs) {
          timer.timerEndsAt = Date.now() + (timer.pauseRemainingMs || timer.remainingSeconds * 1000);
        }
      }

      const remainingSec = timer ? timer.remainingSeconds : 0;
      this.broadcast('auction_resumed', room.id, {
        remainingSeconds: remainingSec,
        isPaused: false,
        hostName,
        message: `▶️ Host (${hostName}) resumed the auction`,
        serverTime: Date.now(),
      });

      if (wasTransitioning) {
        setTimeout(async () => {
          try {
            await this.nominateNextUpcomingPlayer(roomId);
          } catch (err: any) {
            this.logger.error(`Error nominating next upcoming player after resume: ${err?.message}`);
          }
        }, 1000);
      }

      return { resumed: true, remainingSeconds: remainingSec, hostName };
    });
  }

  async setAuctionSpeed(roomId: string, hostUserId: string, targetSpeed?: number) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      const hostMember = room.members?.find((m) => m.userId === hostUserId);
      const hostName = hostMember?.user?.username || 'Host';

      const currentSpeed = this.roomSpeeds.get(room.id) || 1.0;
      let nextSpeed: number;

      if (targetSpeed !== undefined && targetSpeed > 0) {
        // 2x Blitz completely removed: disallow target speeds >= 2.0x, clamping to max 1.5x
        nextSpeed = Math.min(1.5, Math.max(1.0, targetSpeed));
      } else {
        // Cycle: 1.0x -> 1.25x -> 1.5x -> 1.0x (2.0x Blitz completely removed)
        if (currentSpeed < 1.1) {
          nextSpeed = 1.25;
        } else if (currentSpeed < 1.35) {
          nextSpeed = 1.5;
        } else {
          nextSpeed = 1.0;
        }
      }

      this.roomSpeeds.set(room.id, nextSpeed);

      // If timer is active and running, restart it cleanly with updated speed and sync DB timerEndsAt
      const timer = this.timers.get(room.id);
      if (timer && timer.intervalRef && !timer.isPaused) {
        const remainingSec = timer.remainingSeconds;
        const newEndsAt = new Date(Date.now() + Math.round((remainingSec * 1000) / nextSpeed));
        await this.prisma.room.update({
          where: { id: room.id },
          data: { timerEndsAt: newEndsAt },
        });
        this.startTimer(room.id, remainingSec, timer.lotId || undefined);
      }

      const message = nextSpeed === 1.0
        ? `⚡ Host (${hostName}) reset speed to Normal (1x)`
        : `⚡ Host (${hostName}) set auction speed to ${nextSpeed}x Blitz!`;

      this.broadcast('auction_speed_changed', room.id, {
        speedMultiplier: nextSpeed,
        hostName,
        message,
        serverTime: Date.now(),
      });

      return { success: true, speedMultiplier: nextSpeed, message, hostName };
    });
  }

  getRoomSpeed(roomId: string): number {
    const speed = this.roomSpeeds.get(roomId) || 1.0;
    return Math.min(1.5, Math.max(1.0, speed)); // Max 1.5x (2x Blitz completely removed)
  }

  async handleZeroCountdown(roomId: string, lotId?: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
      });
      if (!room || room.isPaused || room.status !== 'AUCTION_ACTIVE') return;

      if (room.currentAuctionPlayerId) {
        if (lotId && room.currentAuctionPlayerId !== lotId) {
          return;
        }

        const ap = await this.prisma.auctionPlayer.findUnique({
          where: { id: room.currentAuctionPlayerId },
        });

        if (ap && ap.status === 'NOMINATED') {
          this.logger.log(`[Zero Countdown] Executing resolution for nominated lot ${ap.id} in room ${roomId}`);
          await this.handleLotCompletionInternal(roomId, undefined, ap.id);
          return;
        }
      }

      const timer = this.timers.get(roomId);
      if (!timer?.nextLotTimeoutRef && !timer?.isTransitioning) {
        this.logger.log(`[Zero Countdown] Stage empty in room ${roomId}. Nominating next player.`);
        await this.nominateNextUpcomingPlayerInternal(roomId);
      }
    });
  }

  async sellNow(roomId: string, hostUserId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      this.clearTimer(room.id);
      await this.handleLotCompletionInternal(room.id);
      return { success: true };
    });
  }

  async markUnsoldNow(roomId: string, hostUserId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      await this.prisma.room.update({
        where: { id: room.id },
        data: { currentBidAmount: 0, currentBidTeamId: null },
      });

      this.clearTimer(room.id);
      await this.handleLotCompletionInternal(room.id);
      return { success: true };
    });
  }

  async endAuction(roomId: string, hostUserId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      const hostMember = room.members?.find((m) => m.userId === hostUserId);
      const hostName = hostMember?.user?.username || 'Host';

      // 1. Clear active countdown timer
      this.clearTimer(room.id);

      // 2. Finalize nominated player if currently on stage
      const nominated = await this.prisma.auctionPlayer.findFirst({
        where: { roomId: room.id, status: 'NOMINATED' },
        include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
      });

      if (nominated) {
        if (nominated.bids && nominated.bids.length > 0) {
          const topBid = nominated.bids[0];
          await this.prisma.$transaction([
            this.prisma.auctionPlayer.update({
              where: { id: nominated.id },
              data: {
                status: 'SOLD',
                soldToTeamId: topBid.teamId,
                soldPrice: topBid.amount,
                soldAt: new Date(),
              },
            }),
            this.prisma.team.update({
              where: { id: topBid.teamId },
              data: {
                currentPurse: { decrement: topBid.amount },
                totalPlayers: { increment: 1 },
              },
            }),
          ]);
        } else {
          await this.prisma.auctionPlayer.update({
            where: { id: nominated.id },
            data: { status: 'UNSOLD', soldAt: new Date() },
          });
        }
      }

      // 3. Mark room as COMPLETED and unpause
      const updatedRoom = await this.prisma.room.update({
        where: { id: room.id },
        data: { status: 'COMPLETED', isPaused: false, currentAuctionPlayerId: null },
        include: {
          teams: true,
          members: { include: { user: { select: { id: true, username: true } } } },
          auctionPlayers: { include: { player: true } },
        },
      });

      // 4. Broadcast completion to all clients
      this.broadcast('auction_ended', room.id, {
        message: `🛑 Host (${hostName}) concluded the auction.`,
        hostName,
        status: 'COMPLETED',
        room: updatedRoom,
      });
      this.broadcast('auction_completed', room.id, {
        message: `🛑 Host (${hostName}) concluded the auction.`,
        hostName,
        status: 'COMPLETED',
        room: updatedRoom,
      });
      this.broadcast('room_sync', room.id, { room: updatedRoom });

      this.timerGenerations.delete(room.id);
      this.roomSpeeds.delete(room.id);
      this.timers.delete(room.id);

      return { success: true, status: 'COMPLETED', room: updatedRoom, hostName };
    });
  }

  async skipPlayer(roomId: string, hostUserId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      const hostMember = room.members?.find((m) => m.userId === hostUserId);
      const hostName = hostMember?.user?.username || 'Host';

      this.clearTimer(room.id);
      let skippedPlayerName = 'current player';
      if (room.currentAuctionPlayerId) {
        const ap = await this.prisma.auctionPlayer.update({
          where: { id: room.currentAuctionPlayerId },
          data: { status: 'PASSED', soldAt: new Date() },
          include: { player: true },
        });
        if (ap?.player?.name) {
          skippedPlayerName = ap.player.name;
        }
        await this.prisma.room.update({
          where: { id: room.id },
          data: { currentAuctionPlayerId: null, currentBidAmount: 0, currentBidTeamId: null },
        });
      }

      this.broadcast('player_skipped', room.id, {
        hostName,
        playerName: skippedPlayerName,
        message: `⏭️ Host (${hostName}) skipped ${skippedPlayerName}`,
        serverTime: Date.now(),
      });

      await this.nominateNextUpcomingPlayerInternal(room.id);
      return { success: true, hostName, playerName: skippedPlayerName };
    });
  }

  async undoLastAction(roomId: string, hostUserId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);
      const hostMember = room.members?.find((m) => m.userId === hostUserId);
      const hostName = hostMember?.user?.username || 'Host';

      const lastFinalized = await this.prisma.auctionPlayer.findFirst({
        where: {
          roomId: room.id,
          status: { in: ['SOLD', 'UNSOLD', 'PASSED'] },
        },
        orderBy: { soldAt: 'desc' },
        include: { player: true },
      });

      if (!lastFinalized) {
        throw new BadRequestException('No previous action available to undo');
      }

      if (lastFinalized.status === 'SOLD' && lastFinalized.soldToTeamId && lastFinalized.soldPrice) {
        const team = await this.prisma.team.findUnique({
          where: { id: lastFinalized.soldToTeamId },
        });

        if (team) {
          await this.prisma.team.update({
            where: { id: team.id },
            data: {
              currentPurse: team.currentPurse + lastFinalized.soldPrice,
              totalPlayers: Math.max(0, team.totalPlayers - 1),
              overseasCount: lastFinalized.player.isOverseas
                ? Math.max(0, team.overseasCount - 1)
                : team.overseasCount,
            },
          });
        }

        await this.prisma.squadMember.deleteMany({
          where: {
            teamId: lastFinalized.soldToTeamId,
            auctionPlayerId: lastFinalized.id,
          },
        });
      }

      await this.prisma.auctionPlayer.update({
        where: { id: lastFinalized.id },
        data: {
          status: 'UPCOMING',
          soldPrice: null,
          soldToTeamId: null,
          soldAt: null,
        },
      });

      await this.prisma.auctionAuditLog.create({
        data: {
          roomId,
          action: 'UNDO_ACTION',
          details: JSON.stringify({
            playerId: lastFinalized.playerId,
            playerName: lastFinalized.player.name,
          }),
        },
      });

      const updatedTeams = await this.prisma.team.findMany({
        where: { roomId },
      });

      this.broadcast('action_undone', roomId, {
        revertedPlayer: lastFinalized,
        hostName,
        playerName: lastFinalized.player.name,
        teams: updatedTeams,
        message: `↩️ Host (${hostName}) undid the hammer action for ${lastFinalized.player.name}.`,
      });

      await this.nominatePlayerInternal(roomId, lastFinalized.id);
      return { success: true, hostName };
    });
  }

  async startAcceleratedRound(roomId: string, hostUserId: string, timerSeconds = 15) {
    return await this.withLock(roomId, async () => {
      const room = await this.verifyHost(roomId, hostUserId);

      // Cancel any pending intermission timers
      this.clearTimer(roomId);

      // 1. Find all UNSOLD players
      const unsoldPlayers = await this.prisma.auctionPlayer.findMany({
        where: { roomId, status: 'UNSOLD' },
        include: { player: true },
      });

      // 2. Mark them as UPCOMING with round: nextRound and fresh randomized lot sequence
      const nextRound = (room.currentRound || 1) + 1;
      let recalledCount = 0;

      if (unsoldPlayers.length > 0) {
        // Group unsold players by base price sets and shuffle within each set so they never come in the same order!
        const listA = unsoldPlayers.filter((ap) => ap.player.basePrice >= 20000000);
        const listB = unsoldPlayers.filter((ap) => ap.player.basePrice >= 15000000 && ap.player.basePrice < 20000000);
        const listC = unsoldPlayers.filter((ap) => ap.player.basePrice >= 10000000 && ap.player.basePrice < 15000000);
        const listOthers = unsoldPlayers.filter((ap) => ap.player.basePrice < 10000000);

        const shuffledUnsold = [
          ...this.shuffleArray(listA),
          ...this.shuffleArray(listB),
          ...this.shuffleArray(listC),
          ...this.shuffleArray(listOthers),
        ];

        let lotBase = 1000 * nextRound;
        for (const ap of shuffledUnsold) {
          await this.prisma.auctionPlayer.update({
            where: { id: ap.id },
            data: {
              status: 'UPCOMING',
              round: nextRound,
              lotNumber: lotBase++,
            },
          });
        }
        recalledCount = unsoldPlayers.length;
      }

      // 3. Update room status to AUCTION_ACTIVE, bidTimerSeconds to accelerated (default 15s), currentRound = nextRound
      const updatedRoom = await this.prisma.room.update({
        where: { id: roomId },
        data: {
          status: 'AUCTION_ACTIVE',
          bidTimerSeconds: timerSeconds,
          currentRound: nextRound,
          isPaused: false,
        },
        include: {
          teams: { include: { squad: { include: { player: true } } } },
          members: { include: { user: true, team: true } },
          auctionPlayers: { include: { player: true } },
        },
      });

      this.broadcast('accelerated_round_started', roomId, {
        round: nextRound,
        timerSeconds,
        recalledCount,
        message: `Accelerated Auction Round ${nextRound} has started! ${recalledCount} unsold players returned to the pool with a ${timerSeconds}s blitz clock!`,
      });

      // 4. If no player is currently nominated, nominate the first upcoming player internal (prevents deadlock)
      if (!room.currentAuctionPlayerId) {
        await this.nominateNextUpcomingPlayerInternal(roomId);
      }

      return { success: true, round: nextRound, recalledCount, room: updatedRoom };
    });
  }

  private shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  async recallPlayer(roomId: string, userId: string, auctionPlayerId: string) {
    return await this.withLock(roomId, async () => {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        include: { members: { include: { user: true } } },
      });
      if (!room) throw new NotFoundException('Room not found');

      const auctionPlayer = await this.prisma.auctionPlayer.findUnique({
        where: { id: auctionPlayerId },
        include: { player: true },
      });
      if (!auctionPlayer || auctionPlayer.roomId !== roomId) {
        throw new NotFoundException('Auction player not found');
      }

      const isHost = room.hostId === userId || room.members.some((m) => m.userId === userId && m.isHost);

      const highestLot = await this.prisma.auctionPlayer.findFirst({
        where: { roomId },
        orderBy: { lotNumber: 'desc' },
      });
      const newLot = (highestLot?.lotNumber || 0) + 1;

      // Re-queue player to UPCOMING with new dynamic lot
      const updatedAP = await this.prisma.auctionPlayer.update({
        where: { id: auctionPlayerId },
        data: {
          status: 'UPCOMING',
          round: Math.max(auctionPlayer.round, 2),
          lotNumber: newLot,
        },
        include: { player: true },
      });

      const member = room.members.find((m) => m.userId === userId);
      const managerName = member?.user?.username || 'Franchise Manager';

      this.broadcast('player_recalled', roomId, {
        auctionPlayer: updatedAP,
        recalledBy: managerName,
        message: `${auctionPlayer.player.name} has been recalled to the pool by ${managerName}!`,
      });

      // If host recalls and no active lot is on stage, nominate immediately!
      if (isHost && !room.currentAuctionPlayerId) {
        await this.nominatePlayerInternal(roomId, auctionPlayerId);
      }

      return { success: true, auctionPlayer: updatedAP };
    });
  }

  getTimerState(roomId: string) {
    const timer = this.timers.get(roomId);
    const speed = this.roomSpeeds.get(roomId) || 1.0;
    return timer
      ? {
          remainingSeconds: timer.remainingSeconds,
          totalSeconds: timer.totalSeconds,
          isPaused: timer.isPaused,
          speedMultiplier: speed,
        }
      : { remainingSeconds: 0, totalSeconds: 0, isPaused: false, speedMultiplier: speed };
  }
}
