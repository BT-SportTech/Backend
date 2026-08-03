import { BadRequestException, Injectable } from '@nestjs/common';
import { MatchOutcome, Prisma, RegistrationStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_PROFILES_PER_PHONE } from '../auth/profile.constants';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  isProfileComplete(user: {
    email: string | null;
    gender: string | null;
    dateOfBirth: Date | null;
    city: string | null;
    state: string | null;
  }) {
    return Boolean(
      user.email?.trim() &&
        user.gender &&
        user.dateOfBirth &&
        (user.city?.trim() || user.state?.trim()),
    );
  }

  async myStats(user: User) {
    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        userId: user.id,
        status: RegistrationStatus.CONFIRMED,
        outcome: { not: null },
      },
      include: {
        event: { select: { sport: true } },
      },
    });

    type Bucket = {
      sport: string;
      played: number;
      won: number;
      lost: number;
      draw: number;
      points: number;
    };

    const bySportMap = new Map<string, Bucket>();
    const totals = { played: 0, won: 0, lost: 0, draw: 0, points: 0 };

    for (const row of rows) {
      const sport = row.event.sport?.trim() || 'Other';
      let bucket = bySportMap.get(sport);
      if (!bucket) {
        bucket = { sport, played: 0, won: 0, lost: 0, draw: 0, points: 0 };
        bySportMap.set(sport, bucket);
      }
      bucket.played += 1;
      totals.played += 1;
      bucket.points += row.pointsEarned;
      totals.points += row.pointsEarned;

      if (row.outcome === MatchOutcome.WIN) {
        bucket.won += 1;
        totals.won += 1;
      } else if (row.outcome === MatchOutcome.LOSS) {
        bucket.lost += 1;
        totals.lost += 1;
      } else if (row.outcome === MatchOutcome.DRAW) {
        bucket.draw += 1;
        totals.draw += 1;
      }
    }

    const bySport = [...bySportMap.values()].sort((a, b) =>
      b.points !== a.points ? b.points - a.points : a.sport.localeCompare(b.sport),
    );

    return { totals, bySport };
  }

  async me(user: User) {
    const fresh = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { school: { select: { id: true, name: true, city: true } } },
    });
    if (!fresh) return null;

    const { passwordHash, ...rest } = fresh;
    const siblings = fresh.phone
      ? await this.prisma.user.findMany({
          where: { phone: fresh.phone },
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [
          {
            id: fresh.id,
            username: fresh.username,
            firstName: fresh.firstName,
            lastName: fresh.lastName,
          },
        ];

    const phoneProfiles = siblings.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: `${u.firstName} ${u.lastName}`.trim(),
      isCurrent: u.id === fresh.id,
    }));

    return {
      ...rest,
      profileComplete: this.isProfileComplete(fresh),
      profileCount: phoneProfiles.length,
      maxProfiles: MAX_PROFILES_PER_PHONE,
      siblingProfiles: phoneProfiles.filter((p) => !p.isCurrent),
      phoneProfiles,
    };
  }

  async updateMe(user: User, dto: UpdateUserDto) {
    let emailUpdate: string | null | undefined = undefined;
    if (dto.email !== undefined) {
      emailUpdate = dto.email?.trim().toLowerCase() || null;
      if (emailUpdate) {
        const taken = await this.prisma.user.findFirst({
          where: { email: emailUpdate, NOT: { id: user.id } },
        });
        if (taken) throw new BadRequestException('Email is already in use.');
      }
    }

    let schoolIdUpdate: string | null | undefined = undefined;
    if (dto.schoolId !== undefined) {
      const schoolId = dto.schoolId?.trim() || null;
      if (schoolId) {
        const school = await this.prisma.school.findFirst({
          where: { id: schoolId, isActive: true },
        });
        if (!school) {
          throw new BadRequestException('Invalid or inactive school.');
        }
      }
      schoolIdUpdate = schoolId;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: emailUpdate,
        phone: dto.phone,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        state: dto.state,
        district: dto.district,
        city: dto.city,
        pincode: dto.pincode,
        sportsInterested: dto.sportsInterested,
        company: dto.company,
        ...(schoolIdUpdate !== undefined ? { schoolId: schoolIdUpdate } : {}),
      },
    });

    return this.me(updated);
  }

  async listAll(query: UserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.state ? { state: { equals: query.state, mode: 'insensitive' } } : {}),
      ...(query.district
        ? { district: { equals: query.district, mode: 'insensitive' } }
        : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.pincode ? { pincode: query.pincode } : {}),
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { username: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
              { company: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          email: true,
          phone: true,
          role: true,
          gender: true,
          city: true,
          district: true,
          state: true,
          pincode: true,
          schoolId: true,
          presentClass: true,
          company: true,
          createdAt: true,
          school: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }
}
