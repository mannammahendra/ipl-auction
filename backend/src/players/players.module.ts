import { Module } from '@nestjs/common';
import { PlayersService } from './players.service.js';
import { PlayersController } from './players.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [PlayersController],
  providers: [PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}

