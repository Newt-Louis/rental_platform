import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/services/redis.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return null;

    const { password: _, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        department: user.department,
        phone: user.phone,
        avatar: user.avatar,
        tenantId: user.tenantId,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Public registration is disabled. Contact an administrator.',
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Public register never allows privileged roles
    const safeRole =
      registerDto.role && registerDto.role === Role.LEASING_EXECUTIVE
        ? Role.LEASING_EXECUTIVE
        : Role.LEASING_EXECUTIVE;

    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email,
        password: hashedPassword,
        fullName: registerDto.fullName,
        role: safeRole,
        phone: registerDto.phone,
        department: registerDto.department,
      },
    });

    const { password: _, ...result } = user;
    return result;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        phone: true,
        avatar: true,
        department: true,
        isActive: true,
        createdAt: true,
        tenantId: true,
        activeMallId: true,
        activeMall: { select: { name: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async setActiveMall(userId: string, mallId: string | null) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { activeMallId: mallId },
    });
    return { activeMallId: mallId };
  }

  async logout(token: string) {
    if (!token) {
      return { success: true };
    }

    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await this.redis.set(this.redis.tokenBlacklistKey(token), '1', ttl);
      }
    }

    return { success: true };
  }
}
