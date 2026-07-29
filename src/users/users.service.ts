import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(user: User) {
    const fresh = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { school: { select: { id: true, name: true, city: true } } },
    });
    if (!fresh) return null;
    const { passwordHash, ...rest } = fresh;
    return rest;
  }

  async updateMe(user: User, dto: UpdateUserDto) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...dto,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      },
    });
    const { passwordHash, ...rest } = updated;
    return rest;
  }

  async listAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        gender: true,
        city: true,
        state: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
