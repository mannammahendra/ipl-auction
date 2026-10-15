import { Module, forwardRef } from '@nestjs/common';
import { AuctionEngine } from './auction.engine.js';
import { AuctionGateway } from './auction.gateway.js';
import { AuctionController } from './auction.controller.js';
import { AuthModule } from '../auth/auth.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';

@Module({
  imports: [AuthModule, forwardRef(() => RoomsModule)],
  controllers: [AuctionController],
  providers: [AuctionEngine, AuctionGateway],
  exports: [AuctionEngine, AuctionGateway],
})
export class AuctionModule {}

