import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PlayersService } from './players.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CreatePlayerDto } from './dto/create-player.dto.js';

@Controller('api/players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()
  async getAllPlayers(
    @Query('role') role?: string,
    @Query('tier') tier?: string,
    @Query('overseas') overseas?: boolean,
    @Query('search') search?: string,
  ) {
    return this.playersService.findAll({ role, tier, overseas, search });
  }

  @Get(':id')
  async getPlayerById(@Param('id') id: string) {
    return this.playersService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createCustomPlayer(@Body() body: CreatePlayerDto) {
    return this.playersService.createPlayer(body);
  }
}

