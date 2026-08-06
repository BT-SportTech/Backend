import { Injectable } from '@nestjs/common';
import { ChessMatchResult } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_RATING = 1000;

@Injectable()
export class ChessRatingService {
  constructor(private readonly prisma: PrismaService) {}

  expectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  kFactor(gamesPlayed: number): number {
    return gamesPlayed < 30 ? 32 : 16;
  }

  newRating(
    currentRating: number,
    opponentRating: number,
    score: number,
    gamesPlayed: number,
  ): number {
    const expected = this.expectedScore(currentRating, opponentRating);
    const k = this.kFactor(gamesPlayed);
    return Math.round(currentRating + k * (score - expected));
  }

  scoreForResult(
    isWhite: boolean,
    result: ChessMatchResult,
  ): number {
    if (result === ChessMatchResult.DRAW) return 0.5;
    if (result === ChessMatchResult.WHITE_WIN) {
      return isWhite ? 1 : 0;
    }
    return isWhite ? 0 : 1;
  }

  async ensureRating(userId: string, gameId: string) {
    return this.prisma.playerGameRating.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: {
        userId,
        gameId,
        rating: DEFAULT_RATING,
      },
      update: {},
    });
  }

  async updateRatingsForMatch(
    gameId: string,
    whiteUserId: string,
    blackUserId: string,
    result: ChessMatchResult,
  ) {
    const [whiteRating, blackRating] = await Promise.all([
      this.ensureRating(whiteUserId, gameId),
      this.ensureRating(blackUserId, gameId),
    ]);

    const whiteScore = this.scoreForResult(true, result);
    const blackScore = this.scoreForResult(false, result);

    const newWhiteRating = this.newRating(
      whiteRating.rating,
      blackRating.rating,
      whiteScore,
      whiteRating.gamesPlayed,
    );
    const newBlackRating = this.newRating(
      blackRating.rating,
      whiteRating.rating,
      blackScore,
      blackRating.gamesPlayed,
    );

    const whiteOutcome =
      whiteScore === 1 ? 'wins' : whiteScore === 0 ? 'losses' : 'draws';
    const blackOutcome =
      blackScore === 1 ? 'wins' : blackScore === 0 ? 'losses' : 'draws';

    await this.prisma.$transaction([
      this.prisma.playerGameRating.update({
        where: { id: whiteRating.id },
        data: {
          rating: newWhiteRating,
          gamesPlayed: { increment: 1 },
          [whiteOutcome]: { increment: 1 },
        },
      }),
      this.prisma.playerGameRating.update({
        where: { id: blackRating.id },
        data: {
          rating: newBlackRating,
          gamesPlayed: { increment: 1 },
          [blackOutcome]: { increment: 1 },
        },
      }),
    ]);

    return {
      white: { previous: whiteRating.rating, updated: newWhiteRating },
      black: { previous: blackRating.rating, updated: newBlackRating },
    };
  }
}
