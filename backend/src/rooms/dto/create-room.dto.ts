import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoomDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Starting purse must be an integer' })
  @Min(10000000, { message: 'Starting purse must be at least ₹1 Crore (10,000,000)' })
  @Max(5000000000, { message: 'Starting purse cannot exceed ₹500 Crores' })
  startingPurse?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Squad size must be an integer' })
  @Min(1, { message: 'Squad size must be at least 1' })
  @Max(35, { message: 'Squad size cannot exceed 35' })
  squadSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Minimum squad must be an integer' })
  @Min(1, { message: 'Minimum squad must be at least 1' })
  @Max(35, { message: 'Minimum squad cannot exceed 35' })
  minSquad?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Maximum squad must be an integer' })
  @Min(1, { message: 'Maximum squad must be at least 1' })
  @Max(35, { message: 'Maximum squad cannot exceed 35' })
  maxSquad?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Maximum overseas quota must be an integer' })
  @Min(1, { message: 'Overseas quota must be at least 1' })
  @Max(15, { message: 'Overseas quota cannot exceed 15' })
  maxOverseas?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Bid timer must be an integer' })
  @Min(5, { message: 'Bid timer must be at least 5 seconds' })
  @Max(120, { message: 'Bid timer cannot exceed 120 seconds' })
  bidTimerSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Snipe extension must be an integer' })
  @Min(0, { message: 'Snipe extension cannot be negative' })
  @Max(30, { message: 'Snipe extension cannot exceed 30 seconds' })
  snipeExtensionSeconds?: number;
}

