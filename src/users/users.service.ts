import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
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
