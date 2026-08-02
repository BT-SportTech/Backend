import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameDto } from './dto/create-game.dto';
import { GameQueryDto } from './dto/game-query.dto';
import { UpdateGameDto } from './dto/update-game.dto';

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateGameDto) {
    const existing = await this.prisma.game.findUnique({
      where: { name: dto.name.trim() },
    });
    if (existing) throw new ConflictException('Game name already exists.');

    const game = await this.prisma.game.create({
      data: {
        name: dto.name.trim(),
        imageUrl: dto.imageUrl,
        sidesPerMatch: dto.sidesPerMatch ?? 2,
        playersPerSide: dto.playersPerSide,
        winPoints: dto.winPoints ?? 0,
        lossPoints: dto.lossPoints ?? 0,
      },
    });
    return this.toResponse(game);
  }

  async findAll(query: GameQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.GameWhereInput = {
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    } else if (!query.includeInactive) {
      where.isActive = true;
    }

    const [rows, total] = await Promise.all([
      this.prisma.game.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.game.count({ where }),
    ]);

    return {
      data: rows.map((g) => this.toResponse(g)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findOne(id: string) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException('Game not found.');
    return this.toResponse(game);
  }

  async update(id: string, dto: UpdateGameDto) {
    await this.findOne(id);

    if (dto.name?.trim()) {
      const clash = await this.prisma.game.findFirst({
        where: { name: dto.name.trim(), NOT: { id } },
      });
      if (clash) throw new ConflictException('Game name already exists.');
    }

    const game = await this.prisma.game.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.sidesPerMatch !== undefined
          ? { sidesPerMatch: dto.sidesPerMatch }
          : {}),
        ...(dto.playersPerSide !== undefined
          ? { playersPerSide: dto.playersPerSide }
          : {}),
        ...(dto.winPoints !== undefined ? { winPoints: dto.winPoints } : {}),
        ...(dto.lossPoints !== undefined ? { lossPoints: dto.lossPoints } : {}),
      },
    });
    return this.toResponse(game);
  }

  async deactivate(id: string) {
    await this.findOne(id);
    await this.prisma.game.update({
      where: { id },
      data: { isActive: false },
    });
    return { message: 'Game deactivated.' };
  }

  private toResponse(game: {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    imageUrl: string | null;
    sidesPerMatch: number;
    playersPerSide: number;
    winPoints: number;
    lossPoints: number;
    isActive: boolean;
  }) {
    return {
      ...game,
      playersPerMatch: game.sidesPerMatch * game.playersPerSide,
    };
  }
}
