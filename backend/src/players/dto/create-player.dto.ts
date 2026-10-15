import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlayerDto {
  @IsString()
  @IsNotEmpty({ message: 'Player name is required' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Country is required' })
  country: string;

  @IsBoolean({ message: 'isOverseas must be a boolean' })
  isOverseas: boolean;

  @IsString()
  @IsIn(['BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKET_KEEPER'], {
    message: 'Role must be BATSMAN, BOWLER, ALL_ROUNDER, or WICKET_KEEPER',
  })
  role: string;

  @IsOptional()
  @IsString()
  battingStyle?: string;

  @IsOptional()
  @IsString()
  bowlingStyle?: string;

  @IsOptional()
  @IsString()
  tier?: string;

  @Type(() => Number)
  @IsInt({ message: 'Base price must be an integer' })
  @Min(1000000, { message: 'Base price must be at least ₹10 Lakhs (1,000,000)' })
  basePrice: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  stats?: any;
}

