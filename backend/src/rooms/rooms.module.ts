import { Module, forwardRef } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';
import { RoomsController } from './rooms.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuctionModule } from '../auction/auction.module.js';

@Module({
  imports: [AuthModule, forwardRef(() => AuctionModule)],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}

