import { Controller, Post, Get, Put, Body, Param, Req, UseGuards } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { JoinRoomDto, SelectTeamDto } from './dto/room-actions.dto.js';

@Controller('api/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createRoom(@Req() req: any, @Body() body: CreateRoomDto) {
    return this.roomsService.createRoom(req.user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('join')
  async joinRoom(@Req() req: any, @Body() body: JoinRoomDto) {
    return this.roomsService.joinRoom(body.code, req.user.sub, body.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':idOrCode')
  async getRoom(@Req() req: any, @Param('idOrCode') idOrCode: string) {
    return this.roomsService.getRoomById(idOrCode, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/settings')
  async updateSettings(@Req() req: any, @Param('id') id: string, @Body() body: UpdateSettingsDto) {
    return this.roomsService.updateSettings(id, req.user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/select-team')
  async selectTeam(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: SelectTeamDto,
  ) {
    return this.roomsService.selectTeam(id, req.user.sub, body.teamId, body.managerName);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/ready')
  async toggleReady(@Req() req: any, @Param('id') id: string) {
    return this.roomsService.toggleReady(id, req.user.sub);
  }
}

