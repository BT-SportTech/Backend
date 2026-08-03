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
import { User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OtpService } from './otp.service';
import { MAX_PROFILES_PER_PHONE } from './profile.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
  ) {}

  async profilesForPhone(phone: string) {
    const normalized = this.otp.normalizePhone(phone);
    const users = await this.prisma.user.findMany({
      where: { phone: normalized },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      phone: normalized,
      profileCount: users.length,
      maxProfiles: MAX_PROFILES_PER_PHONE,
      profiles: users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: `${u.firstName} ${u.lastName}`.trim(),
      })),
    };
  }

  async register(dto: RegisterDto) {
    if ((dto.role as string) === UserRole.ADMIN) {
      throw new ForbiddenException('Cannot self-register as admin.');
    }

    if (dto.role === UserRole.PLAYER && dto.schoolId) {
      const school = await this.prisma.school.findFirst({
        where: { id: dto.schoolId, isActive: true },
      });
      if (!school) throw new BadRequestException('Invalid or inactive school.');
    }

    if (!this.otp.isPhoneVerified(dto.phone)) {
      throw new BadRequestException(
        'Phone number must be verified with OTP before registration.',
      );
    }
    const normalizedPhone = this.otp.normalizePhone(dto.phone);

    const profileCount = await this.prisma.user.count({
      where: { phone: normalizedPhone },
    });
    if (profileCount >= MAX_PROFILES_PER_PHONE) {
      throw new BadRequestException(
        `This phone number already has ${MAX_PROFILES_PER_PHONE} profiles.`,
      );
    }

    const username = dto.username.trim().toLowerCase();
    const usernameTaken = await this.prisma.user.findUnique({
      where: { username },
    });
    if (usernameTaken) throw new BadRequestException('Username is already taken.');

    const email = dto.email?.trim().toLowerCase() || null;
    if (email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email } });
      if (emailTaken) throw new BadRequestException('Email is already in use.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        username,
        email,
        phone: normalizedPhone,
        passwordHash,
        role: dto.role,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        state: dto.state,
        district: dto.district,
        city: dto.city,
        pincode: dto.pincode,
        sportsInterested: dto.sportsInterested ?? [],
        schoolId: dto.role === UserRole.PLAYER ? dto.schoolId : undefined,
        presentClass: dto.role === UserRole.PLAYER ? dto.presentClass : undefined,
        company: dto.role === UserRole.PROFESSIONAL ? dto.company : undefined,
      },
    });

    const tokens = await this.generateTokens(user);
    return { ...tokens, user: this.sanitize(user) };
  }

  async login(dto: LoginDto) {
    const identity = (dto.username ?? dto.email ?? '').trim().toLowerCase();
    if (!identity) throw new UnauthorizedException('Invalid credentials.');

    const user = identity.includes('@')
      ? await this.prisma.user.findUnique({ where: { email: identity } })
      : await this.prisma.user.findUnique({ where: { username: identity } });

    if (!user) throw new UnauthorizedException('Invalid credentials.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials.');

    const tokens = await this.generateTokens(user);
    return { ...tokens, user: this.sanitize(user) };
  }

  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException();

    return this.generateTokens(user);
  }

  async logout(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email ?? user.username,
      username: user.username,
      role: user.role,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const rawRefresh = crypto.randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawRefresh);
    const expiresIn = this.config.get('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const expiresAt = new Date(Date.now() + this.parseDuration(expiresIn));

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId: user.id, expiresAt },
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

  private sanitize(user: User) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
