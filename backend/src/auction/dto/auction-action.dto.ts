import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class NominatePlayerDto {
  @IsString()
  @IsNotEmpty({ message: 'auctionPlayerId is required' })
  auctionPlayerId: string;
}

export class PlaceBidDto {
  @IsString()
  @IsNotEmpty({ message: 'teamId is required' })
  teamId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'amount must be a valid number' })
  @Min(100000, { message: 'amount must be at least ₹1 Lakh' })
  amount?: number;
}

export class SetSpeedDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'speedMultiplier must be a valid number' })
  @Min(0.5, { message: 'speedMultiplier must be at least 0.5' })
  @Max(5.0, { message: 'speedMultiplier cannot exceed 5.0' })
  speedMultiplier?: number;
}

