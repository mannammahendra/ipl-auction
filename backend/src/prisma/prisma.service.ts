import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    // Enable WAL mode and 10s busy timeout for SQLite to prevent SQLITE_BUSY concurrency stalls
    try {
      await this.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
      await this.$executeRawUnsafe('PRAGMA busy_timeout = 10000;');
      await this.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
    } catch {
      // Harmless on non-SQLite databases
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

