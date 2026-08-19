import { Injectable } from '@nestjs/common';
import { ChessMatchResult, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type RatingDbClient = PrismaService | Prisma.TransactionClient;
import {
  CHESS_DRAW_POINTS,
  CHESS_LOSS_POINTS,
  CHESS_STARTING_POINTS,
  CHESS_WIN_POINTS,
  chessPointsDelta,
} from './chess-points';

export {
  CHESS_DRAW_POINTS,
  CHESS_LOSS_POINTS,
  CHESS_STARTING_POINTS,
  CHESS_WIN_POINTS,
};

@Injectable()
export class ChessRatingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Points delta for a player given match result (fixed, not Elo). */
  pointsDeltaForResult(
    isWhite: boolean,
    result: ChessMatchResult,
  ): number {
    const score = this.scoreForResult(isWhite, result);
    if (score === 1) return chessPointsDelta('win');
    if (score === 0) return chessPointsDelta('loss');
    return chessPointsDelta('draw');
  }

  newRating(
    currentRating: number,
    _opponentRating: number,
    score: number,
    _gamesPlayed: number,
  ): number {
    if (score === 1) return currentRating + CHESS_WIN_POINTS;
    if (score === 0) return currentRating + CHESS_LOSS_POINTS;
    return currentRating + CHESS_DRAW_POINTS;
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

  async ensureRating(
    userId: string,
    gameId: string,
    client: RatingDbClient = this.prisma,
  ) {
    return client.playerGameRating.upsert({
      where: { userId_gameId: { userId, gameId } },
      create: {
        userId,
        gameId,
        rating: CHESS_STARTING_POINTS,
      },
      update: {},
    });
  }

  async updateRatingsForMatch(
    gameId: string,
    whiteUserId: string,
    blackUserId: string,
    result: ChessMatchResult,
    client?: Prisma.TransactionClient,
  ) {
    const db = client ?? this.prisma;
    const [whiteRating, blackRating] = await Promise.all([
      this.ensureRating(whiteUserId, gameId, db),
      this.ensureRating(blackUserId, gameId, db),
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

    const updates = [
      db.playerGameRating.update({
        where: { id: whiteRating.id },
        data: {
          rating: newWhiteRating,
          gamesPlayed: { increment: 1 },
          [whiteOutcome]: { increment: 1 },
        },
      }),
      db.playerGameRating.update({
        where: { id: blackRating.id },
        data: {
          rating: newBlackRating,
          gamesPlayed: { increment: 1 },
          [blackOutcome]: { increment: 1 },
        },
      }),
    ];

    if (client) {
      await Promise.all(updates);
    } else {
      await this.prisma.$transaction(updates);
    }

    return {
      white: { previous: whiteRating.rating, updated: newWhiteRating },
      black: { previous: blackRating.rating, updated: newBlackRating },
    };
  }

  /** Walkover: only the winner gains rating; withdrawn player is unchanged. */
  async applyWalkoverWin(
    winnerUserId: string,
    gameId: string,
    client: Prisma.TransactionClient,
  ) {
    const rating = await this.ensureRating(winnerUserId, gameId, client);
    const updated = rating.rating + CHESS_WIN_POINTS;
    await client.playerGameRating.update({
      where: { id: rating.id },
      data: {
        rating: updated,
        gamesPlayed: { increment: 1 },
        wins: { increment: 1 },
      },
    });
    return { previous: rating.rating, updated };
  }
}
