import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(username: string, email?: string, password?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username },
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (existing) {
      throw new BadRequestException('Username or email already exists');
    }

    let hashedPassword = null;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const user = await this.prisma.user.create({
      data: {
        username,
        email: email || null,
        password: hashedPassword,
        isGuest: !password,
      },
    });

    const token = this.generateToken(user);
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isGuest: user.isGuest,
      },
      token,
    };
  }

  async login(username: string, password?: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password || user.isGuest) {
      throw new UnauthorizedException('Password login is not available for guest accounts. Please sign in as a guest or create an account.');
    }

    if (!password) {
      throw new UnauthorizedException('Password required');
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = this.generateToken(user);
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isGuest: user.isGuest,
      },
      token,
    };
  }

  async guestLogin(displayName: string) {
    const cleanName = displayName.trim().slice(0, 20) || 'Bidder';
    const uniqueSuffix = Math.floor(1000 + Math.random() * 9000);
    const username = `${cleanName}#${uniqueSuffix}`;

    const user = await this.prisma.user.create({
      data: {
        username,
        isGuest: true,
      },
    });

    const token = this.generateToken(user);
    return {
      user: {
        id: user.id,
        username: user.username,
        isGuest: true,
      },
      token,
    };
  }

  async validateUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        isGuest: true,
        avatar: true,
      },
    });
  }

  private generateToken(user: { id: string; username: string }) {
    return this.jwtService.sign({
      sub: user.id,
      username: user.username,
    });
  }
}

