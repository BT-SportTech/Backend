import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { generateUniqueCodeCandidate } from '../common/unique-code';
import { formatDisplayName } from '../common/display-name';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetMpinDto } from './dto/reset-mpin.dto';
import { OtpService } from './otp.service';
import { MAX_PROFILES_PER_PHONE } from './profile.constants';

const UNIQUE_CODE_MAX_ATTEMPTS = 24;

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
        displayName: formatDisplayName(u.firstName, u.lastName),
      })),
    };
  }

  async register(dto: RegisterDto) {
    if (
      (dto.role as string) === UserRole.ADMIN ||
      (dto.role as string) === UserRole.ORGANIZER
    ) {
      throw new ForbiddenException('Cannot self-register as admin or organizer.');
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

    const email = dto.email?.trim().toLowerCase() || null;
    if (email) {
      const emailTaken = await this.prisma.user.findUnique({ where: { email } });
      if (emailTaken) throw new BadRequestException('Email is already in use.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    let user: User | null = null;
    for (let attempt = 0; attempt < UNIQUE_CODE_MAX_ATTEMPTS; attempt++) {
      const username = await this.allocateUniqueCode();
      try {
        user = await this.prisma.user.create({
          data: {
            firstName: dto.firstName.trim(),
            lastName: '',
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
            presentClass:
              dto.role === UserRole.PLAYER ? dto.presentClass : undefined,
            company: dto.role === UserRole.PROFESSIONAL ? dto.company : undefined,
          },
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const targets = err.meta?.target;
          const hitUsername =
            Array.isArray(targets) &&
            targets.some((t) => String(t).includes('username'));
          if (hitUsername) continue;
        }
        throw err;
      }
    }

    if (!user) {
      throw new BadRequestException(
        'Could not allocate a unique player code. Please try again.',
      );
    }

    const tokens = await this.generateTokens(user);
    return { ...tokens, user: this.sanitize(user) };
  }

  /** Picks an unused 8-character alphanumeric code (stored as `username`). */
  private async allocateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < UNIQUE_CODE_MAX_ATTEMPTS; attempt++) {
      const candidate = generateUniqueCodeCandidate();
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException(
      'Could not allocate a unique player code. Please try again.',
    );
  }

  async login(dto: LoginDto) {
    if (dto.phone) {
      if (!/^\d{6}$/.test(dto.password)) {
        throw new UnauthorizedException('Invalid credentials.');
      }

      const normalized = this.otp.normalizePhone(dto.phone);
      const users = await this.prisma.user.findMany({
        where: { phone: normalized },
      });
      if (!users.length) {
        throw new UnauthorizedException('Invalid credentials.');
      }

      const matches: User[] = [];
      for (const candidate of users) {
        const valid = await bcrypt.compare(dto.password, candidate.passwordHash);
        if (valid) matches.push(candidate);
      }
      if (!matches.length) {
        throw new UnauthorizedException('Invalid credentials.');
      }
      if (matches.length > 1) {
        throw new UnauthorizedException(
          'Multiple profiles use this Mpin. Contact support.',
        );
      }

      const tokens = await this.generateTokens(matches[0]);
      return { ...tokens, user: this.sanitize(matches[0]) };
    }

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

  async resetMpin(dto: ResetMpinDto) {
    if (!this.otp.isPhoneVerified(dto.phone)) {
      throw new BadRequestException(
        'Phone number must be verified with OTP first.',
      );
    }

    const normalizedPhone = this.otp.normalizePhone(dto.phone);
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user || user.phone !== normalizedPhone) {
      throw new BadRequestException('Invalid profile for this phone number.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    const tokens = await this.generateTokens(updated);
    return { ...tokens, user: this.sanitize(updated) };
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

  async issueTokensForUser(user: User) {
    const tokens = await this.generateTokens(user);
    return { ...tokens, user: this.sanitize(user) };
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
