import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsNotEmpty({ message: 'Room code is required' })
  code: string;

  @IsOptional()
  @IsString()
  password?: string;
}

export class SelectTeamDto {
  @IsString()
  @IsNotEmpty({ message: 'Team ID is required' })
  teamId: string;

  @IsOptional()
  @IsString()
  managerName?: string;
}

