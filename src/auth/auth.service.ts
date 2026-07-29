import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if ((dto.role as string) === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot self-register as admin.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already in use.');

    if (dto.role === UserRole.STUDENT) {
      if (!dto.schoolId) throw new BadRequestException('schoolId is required for students.');
      const school = await this.prisma.school.findFirst({
        where: { id: dto.schoolId, isActive: true },
      });
      if (!school) throw new BadRequestException('Invalid or inactive school.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        state: dto.state,
        district: dto.district,
        city: dto.city,
        pincode: dto.pincode,
        sportsInterested: dto.sportsInterested ?? [],
        schoolId: dto.role === UserRole.STUDENT ? dto.schoolId : undefined,
        presentClass: dto.role === UserRole.STUDENT ? dto.presentClass : undefined,
        company: dto.role === UserRole.PROFESSIONAL ? dto.company : undefined,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return { ...tokens, user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials.');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    return { ...tokens, user: this.sanitize(user) };
  }

  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    // Rotate: revoke old, issue new pair
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException();

    return this.generateTokens(user.id, user.email, user.role);
  }

  async logout(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async generateTokens(userId: string, email: string, role: UserRole) {
    const payload = { sub: userId, email, role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const rawRefresh = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawRefresh);
    const expiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const expiresAt = new Date(Date.now() + this.parseDuration(expiresIn));

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId, expiresAt },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseDuration(duration: string): number {
    const unit = duration.slice(-1);
    const value = parseInt(duration.slice(0, -1), 10);
    const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * (map[unit] ?? 1000);
  }

  private sanitize(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
