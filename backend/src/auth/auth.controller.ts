import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './auth.guard.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthRateLimitGuard)
  @Post('register')
  async register(
    @Body('username') username: string,
    @Body('email') email?: string,
    @Body('password') password?: string,
  ) {
    return this.authService.register(username, email, password);
  }

  @UseGuards(AuthRateLimitGuard)
  @Post('login')
  async login(
    @Body('username') username: string,
    @Body('password') password?: string,
  ) {
    return this.authService.login(username, password);
  }

  @UseGuards(AuthRateLimitGuard)
  @Post('guest')
  async guestLogin(@Body('displayName') displayName: string) {
    return this.authService.guestLogin(displayName || 'Player');
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req: any) {
    return this.authService.validateUserById(req.user.sub);
  }
}

