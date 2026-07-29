import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSchoolDto) {
    const existing = await this.prisma.school.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('School code already registered.');
    return this.prisma.school.create({ data: dto });
  }

  findAll(search?: string) {
    return this.prisma.school.findMany({
      where: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        city: true,
        district: true,
        state: true,
        logoUrl: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const school = await this.prisma.school.findFirst({ where: { id, isActive: true } });
    if (!school) throw new NotFoundException('School not found.');
    return school;
  }

  async update(id: string, dto: UpdateSchoolDto) {
    await this.findOne(id);
    return this.prisma.school.update({ where: { id }, data: dto });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    await this.prisma.school.update({ where: { id }, data: { isActive: false } });
    return { message: 'School deactivated.' };
  }
}
