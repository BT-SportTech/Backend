import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RatingWithUser = {
  userId: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
  };
};

@Injectable()
export class ChessRankingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async chessGameId(): Promise<string | null> {
    const game = await this.prisma.game.findFirst({
      where: {
        name: { equals: 'Chess', mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true },
    });
    return game?.id ?? null;
  }

  private toEntry(row: RatingWithUser, rank: number) {
    const name =
      `${row.user.firstName} ${row.user.lastName}`.trim() || row.user.username;
    return {
      rank,
      userId: row.userId,
      name,
      rating: row.rating,
      gamesPlayed: row.gamesPlayed,
      wins: row.wins,
      losses: row.losses,
    };
  }

  async listRankings(limit = 100) {
    const gameId = await this.chessGameId();
    if (!gameId) return { data: [] };

    const rows = await this.prisma.playerGameRating.findMany({
      where: { gameId, gamesPlayed: { gt: 0 } },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'asc' }],
      take: limit,
    });

    return {
      data: rows.map((row, index) => this.toEntry(row, index + 1)),
    };
  }

  async nearbyForUser(userId: string) {
    const gameId = await this.chessGameId();
    if (!gameId) return null;

    const rows = await this.prisma.playerGameRating.findMany({
      where: { gameId, gamesPlayed: { gt: 0 } },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
      },
      orderBy: [{ rating: 'desc' }, { updatedAt: 'asc' }],
    });

    const board = rows.map((row, index) => this.toEntry(row, index + 1));
    const idx = board.findIndex((entry) => entry.userId === userId);
    if (idx === -1) return null;

    return {
      rank: idx + 1,
      me: board[idx],
      above: idx > 0 ? board[idx - 1] : null,
      below: idx < board.length - 1 ? board[idx + 1] : null,
    };
  }
}
