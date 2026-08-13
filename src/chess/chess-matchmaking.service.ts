import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChessBatchStatus,
  ChessMatchResult,
  ChessMatchStatus,
  ChessRoundStatus,
  EventStatus,
  MatchOutcome,
  MatchmakingStatus,
  RegistrationStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ageFromDateOfBirth,
  pairForRound,
  PairingPlayer,
} from './chess-pairing.engine';
import { ChessRatingService } from './chess-rating.service';

const CHESS_GAME_NAME = 'Chess';

@Injectable()
export class ChessMatchmakingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ratingService: ChessRatingService,
  ) {}

  async startMatchmaking(
    eventId: string,
    user: User,
    boardCountOverride?: number,
  ) {
    const event = await this.getChessEventOrThrow(eventId, user);

    if (event.matchmakingStatus !== MatchmakingStatus.NOT_STARTED) {
      throw new BadRequestException(
        'Matchmaking has already started. Use next-batch to continue.',
      );
    }

    const boardCount = boardCountOverride ?? event.boardCount;
    if (!boardCount || boardCount < 1) {
      throw new BadRequestException(
        'boardCount is required for chess matchmaking.',
      );
    }

    const eligibleCount = await this.countEligiblePlayers(eventId);
    if (eligibleCount < 2) {
      throw new BadRequestException(
        'At least 2 attended, non-withdrawn players are required.',
      );
    }

    await this.prisma.event.update({
      where: { id: eventId },
      data: {
        matchmakingStatus: MatchmakingStatus.IN_PROGRESS,
        matchmakingStartedAt: new Date(),
        ...(boardCountOverride ? { boardCount: boardCountOverride } : {}),
      },
    });

    const round = await this.prisma.chessRound.create({
      data: {
        eventId,
        roundNumber: 1,
        status: ChessRoundStatus.ACTIVE,
      },
    });

    const batch = await this.generateBatch(eventId, round.id, 1, 1, boardCount);
    if (batch.byePlayer) {
      await this.grantBye(batch.byePlayer.registrationId);
    }
    return batch;
  }

  async nextBatch(eventId: string, user: User) {
    const event = await this.getChessEventOrThrow(eventId, user);

    if (event.matchmakingStatus !== MatchmakingStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Matchmaking is not in progress for this event.',
      );
    }

    const activeBatch = await this.getActiveBatch(eventId);
    if (!activeBatch) {
      throw new BadRequestException('No active batch found.');
    }

    const pendingMatches = activeBatch.matches.filter(
      (m) => m.status === ChessMatchStatus.SCHEDULED,
    );
    if (pendingMatches.length > 0) {
      throw new BadRequestException(
        'Complete all matches in the current batch before starting the next.',
      );
    }

    await this.prisma.chessRoundBatch.update({
      where: { id: activeBatch.id },
      data: { status: ChessBatchStatus.COMPLETED },
    });

    const round = activeBatch.round;
    const boardCount = activeBatch.boardCount;

    const remainingInRound = await this.countPlayersNeedingGameInRound(
      eventId,
      round.roundNumber,
    );

    if (remainingInRound >= 2) {
      const nextBatchNumber = activeBatch.batchNumber + 1;
      const batch = await this.generateBatch(
        eventId,
        round.id,
        round.roundNumber,
        nextBatchNumber,
        boardCount,
      );
      if (batch.byePlayer) {
        await this.grantBye(batch.byePlayer.registrationId);
      }
      return batch;
    }

    let byeGranted: { registrationId: string; userId: string } | null = null;
    if (remainingInRound === 1) {
      const byeRegistration = await this.findSinglePlayerNeedingGameInRound(
        eventId,
        round.roundNumber,
      );
      if (byeRegistration) {
        await this.grantBye(byeRegistration.id);
        byeGranted = {
          registrationId: byeRegistration.id,
          userId: byeRegistration.userId,
        };
      }
    }

    await this.prisma.chessRound.update({
      where: { id: round.id },
      data: { status: ChessRoundStatus.COMPLETED },
    });

    const playersNeedingMore = await this.countPlayersNeedingMoreGames(
      eventId,
      event.gamesPerPlayer,
    );

    if (playersNeedingMore > 0) {
      const nextRoundNumber = round.roundNumber + 1;
      if (nextRoundNumber > event.gamesPerPlayer) {
        throw new BadRequestException(
          'Some players have not completed all required games.',
        );
      }

      const nextRound = await this.prisma.chessRound.create({
        data: {
          eventId,
          roundNumber: nextRoundNumber,
          status: ChessRoundStatus.ACTIVE,
        },
      });

      const batch = await this.generateBatch(
        eventId,
        nextRound.id,
        nextRoundNumber,
        1,
        boardCount,
      );

      if (batch.byePlayer) {
        await this.grantBye(batch.byePlayer.registrationId);
      }

      return { ...batch, byeGranted };
    }

    await this.finalizeMatchmaking(eventId);
    const status = await this.getStatus(eventId, user);
    return { ...status, byeGranted };
  }

  async getStatus(eventId: string, user: User) {
    await this.getChessEventOrThrow(eventId, user);

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: {
        chessRounds: {
          include: {
            batches: {
              include: {
                matches: {
                  include: this.matchInclude(),
                },
              },
              orderBy: { batchNumber: 'asc' },
            },
          },
          orderBy: { roundNumber: 'asc' },
        },
      },
    });

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: RegistrationStatus.CONFIRMED,
        attendedAt: { not: null },
      },
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
    });

    let activeBatch: (typeof event.chessRounds)[number]['batches'][number] | null =
      null;
    let activeRoundNumber = -1;
    for (const round of event.chessRounds) {
      for (const batch of round.batches) {
        if (batch.status !== ChessBatchStatus.ACTIVE) continue;
        if (
          !activeBatch ||
          round.roundNumber > activeRoundNumber ||
          (round.roundNumber === activeRoundNumber &&
            batch.batchNumber > activeBatch.batchNumber)
        ) {
          activeBatch = batch;
          activeRoundNumber = round.roundNumber;
        }
      }
    }

    return {
      eventId,
      matchmakingStatus: event.matchmakingStatus,
      matchmakingStartedAt: event.matchmakingStartedAt,
      boardCount: event.boardCount,
      gamesPerPlayer: event.gamesPerPlayer,
      /** Which game (1st, 2nd, 3rd…) each player is on — not total event rounds. */
      currentGame: activeBatch?.roundId
        ? event.chessRounds.find((r) => r.id === activeBatch.roundId)
            ?.roundNumber ?? null
        : null,
      /** @deprecated Use currentGame — same value (game number, not event round count). */
      currentRound: activeBatch?.roundId
        ? event.chessRounds.find((r) => r.id === activeBatch.roundId)
            ?.roundNumber ?? null
        : null,
      currentBatch: activeBatch?.batchNumber ?? null,
      activeBatch: activeBatch
        ? {
            id: activeBatch.id,
            batchNumber: activeBatch.batchNumber,
            boardCount: activeBatch.boardCount,
            pendingMatches: activeBatch.matches.filter(
              (m) => m.status === ChessMatchStatus.SCHEDULED,
            ).length,
            completedMatches: activeBatch.matches.filter(
              (m) => m.status === ChessMatchStatus.COMPLETED,
            ).length,
          }
        : null,
      playerProgress: registrations.map((r) => ({
        registrationId: r.id,
        userId: r.userId,
        user: r.user,
        withdrawn: !!r.withdrawnAt,
        gamesCompleted: r.gamesCompleted,
        eventWins: r.eventWins,
        eventLosses: r.eventLosses,
        eventDraws: r.eventDraws,
        whiteGames: r.whiteGames,
        blackGames: r.blackGames,
      })),
      rounds: event.chessRounds.map((r) => ({
        id: r.id,
        gameNumber: r.roundNumber,
        roundNumber: r.roundNumber,
        status: r.status,
        batches: r.batches.map((b) => ({
          id: b.id,
          batchNumber: b.batchNumber,
          status: b.status,
          matchCount: b.matches.length,
        })),
      })),
    };
  }

  async listMatches(eventId: string, user: User) {
    await this.getChessEventOrThrow(eventId, user, true);

    const matches = await this.prisma.chessMatch.findMany({
      where: {
        batch: { round: { eventId } },
        ...(user.role === UserRole.PLAYER
          ? {
              OR: [
                { whiteRegistration: { userId: user.id } },
                { blackRegistration: { userId: user.id } },
              ],
            }
          : {}),
      },
      include: {
        batch: {
          select: {
            batchNumber: true,
            round: { select: { roundNumber: true } },
          },
        },
        ...this.matchInclude(),
      },
      orderBy: [
        { batch: { round: { roundNumber: 'asc' } } },
        { batch: { batchNumber: 'asc' } },
        { boardNumber: 'asc' },
      ],
    });

    return {
      eventId,
      data: matches.map((m) => this.toMatchResponse(m)),
    };
  }

  async setMatchResult(
    eventId: string,
    matchId: string,
    result: ChessMatchResult,
    user: User,
  ) {
    const event = await this.getChessEventOrThrow(eventId, user);

    if (event.matchmakingStatus === MatchmakingStatus.COMPLETED) {
      throw new BadRequestException('Matchmaking is already completed.');
    }

    const match = await this.prisma.chessMatch.findFirst({
      where: {
        id: matchId,
        batch: { round: { eventId } },
      },
      include: {
        whiteRegistration: true,
        blackRegistration: true,
      },
    });

    if (!match) {
      throw new NotFoundException('Match not found.');
    }

    if (match.status !== ChessMatchStatus.SCHEDULED) {
      throw new BadRequestException('Match result has already been recorded.');
    }

    if (!event.gameId) {
      throw new BadRequestException('Event has no linked game.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chessMatch.update({
        where: { id: matchId },
        data: {
          result,
          status: ChessMatchStatus.COMPLETED,
          completedAt: new Date(),
          completedById: user.id,
        },
      });

      const whiteWon = result === ChessMatchResult.WHITE_WIN;
      const blackWon = result === ChessMatchResult.BLACK_WIN;
      const isDraw = result === ChessMatchResult.DRAW;

      await tx.eventRegistration.update({
        where: { id: match.whiteRegistrationId },
        data: {
          gamesCompleted: { increment: 1 },
          whiteGames: { increment: 1 },
          ...(whiteWon
            ? { eventWins: { increment: 1 } }
            : blackWon
              ? { eventLosses: { increment: 1 } }
              : { eventDraws: { increment: 1 } }),
        },
      });

      await tx.eventRegistration.update({
        where: { id: match.blackRegistrationId },
        data: {
          gamesCompleted: { increment: 1 },
          blackGames: { increment: 1 },
          ...(blackWon
            ? { eventWins: { increment: 1 } }
            : whiteWon
              ? { eventLosses: { increment: 1 } }
              : { eventDraws: { increment: 1 } }),
        },
      });
    });

    await this.ratingService.updateRatingsForMatch(
      event.gameId,
      match.whiteRegistration.userId,
      match.blackRegistration.userId,
      result,
    );

    const updated = await this.prisma.chessMatch.findUniqueOrThrow({
      where: { id: matchId },
      include: {
        batch: {
          select: {
            batchNumber: true,
            round: { select: { roundNumber: true } },
          },
        },
        ...this.matchInclude(),
      },
    });

    return this.toMatchResponse(updated);
  }

  async withdrawPlayer(
    eventId: string,
    registrationId: string,
    user: User,
  ) {
    const event = await this.getChessEventOrThrow(eventId, user);

    if (event.matchmakingStatus === MatchmakingStatus.COMPLETED) {
      throw new BadRequestException(
        'Cannot withdraw players after matchmaking is completed.',
      );
    }

    const registration = await this.prisma.eventRegistration.findFirst({
      where: {
        id: registrationId,
        eventId,
        status: RegistrationStatus.CONFIRMED,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found.');
    }

    if (!registration.attendedAt) {
      throw new BadRequestException(
        'Only attended players can be withdrawn as walkouts.',
      );
    }

    if (registration.withdrawnAt) {
      throw new BadRequestException('Player is already withdrawn.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.eventRegistration.update({
        where: { id: registrationId },
        data: {
          withdrawnAt: new Date(),
          withdrawnById: user.id,
        },
      });

      const scheduledMatches = await tx.chessMatch.findMany({
        where: {
          status: ChessMatchStatus.SCHEDULED,
          OR: [
            { whiteRegistrationId: registrationId },
            { blackRegistrationId: registrationId },
          ],
        },
      });

      for (const match of scheduledMatches) {
        await tx.chessMatch.update({
          where: { id: match.id },
          data: { status: ChessMatchStatus.CANCELLED },
        });
      }
    });

    const updated = await this.prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registrationId },
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
    });

    return {
      id: updated.id,
      userId: updated.userId,
      user: updated.user,
      attendedAt: updated.attendedAt,
      withdrawnAt: updated.withdrawnAt,
      withdrawnById: updated.withdrawnById,
    };
  }

  private async generateBatch(
    eventId: string,
    roundId: string,
    roundNumber: number,
    batchNumber: number,
    boardCount: number,
  ) {
    const players = await this.buildPairingPool(eventId, roundNumber);
    const pairingResult = pairForRound(roundNumber, players, boardCount);

    if (pairingResult.pairs.length === 0) {
      if (pairingResult.byePlayer) {
        await this.grantBye(pairingResult.byePlayer.registrationId);
      }
      throw new BadRequestException(
        pairingResult.byePlayer
          ? 'Only one player remained in this board set; bye recorded. Tap next board set to continue.'
          : 'No pairings could be generated for this batch.',
      );
    }

    const batch = await this.prisma.chessRoundBatch.create({
      data: {
        roundId,
        batchNumber,
        boardCount,
        status: ChessBatchStatus.ACTIVE,
        matches: {
          create: pairingResult.pairs.map((pair, index) => ({
            boardNumber: index + 1,
            whiteRegistrationId: pair.white.registrationId,
            blackRegistrationId: pair.black.registrationId,
          })),
        },
      },
      include: {
        matches: { include: this.matchInclude() },
        round: { select: { roundNumber: true } },
      },
    });

    return {
      roundNumber,
      batchNumber,
      boardCount,
      byePlayer: pairingResult.byePlayer
        ? {
            registrationId: pairingResult.byePlayer.registrationId,
            userId: pairingResult.byePlayer.userId,
          }
        : null,
      unpairedCount: pairingResult.unpairedPlayers.length,
      matches: batch.matches.map((m) => this.toMatchResponse(m)),
    };
  }

  private async buildPairingPool(
    eventId: string,
    roundNumber: number,
  ): Promise<PairingPlayer[]> {
    const targetGamesCompleted = roundNumber - 1;

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: RegistrationStatus.CONFIRMED,
        attendedAt: { not: null },
        withdrawnAt: null,
        gamesCompleted: targetGamesCompleted,
      },
      include: {
        user: { select: { id: true, dateOfBirth: true } },
      },
    });

    const alreadyScheduledIds = await this.getScheduledRegistrationIdsInRound(
      eventId,
      roundNumber,
    );

    const available = registrations.filter(
      (r) => !alreadyScheduledIds.has(r.id),
    );

    const gameId = await this.getChessGameId();
    const userIds = available.map((r) => r.userId);
    const ratings = await this.prisma.playerGameRating.findMany({
      where: { gameId, userId: { in: userIds } },
    });
    const ratingByUser = new Map(ratings.map((r) => [r.userId, r]));

    const opponentMap = await this.buildOpponentMap(eventId);

    return available.map((r) => {
      const ratingRow = ratingByUser.get(r.userId);
      const age = r.user.dateOfBirth
        ? ageFromDateOfBirth(r.user.dateOfBirth)
        : 18;

      return {
        registrationId: r.id,
        userId: r.userId,
        rating: ratingRow?.rating ?? 1000,
        age,
        gamesPlayedOnPlatform: ratingRow?.gamesPlayed ?? 0,
        eventWins: r.eventWins,
        eventLosses: r.eventLosses,
        eventDraws: r.eventDraws,
        whiteGames: r.whiteGames,
        blackGames: r.blackGames,
        opponentRegistrationIds: opponentMap.get(r.id) ?? [],
      };
    });
  }

  private async buildOpponentMap(eventId: string) {
    const completedMatches = await this.prisma.chessMatch.findMany({
      where: {
        status: ChessMatchStatus.COMPLETED,
        batch: { round: { eventId } },
      },
      select: {
        whiteRegistrationId: true,
        blackRegistrationId: true,
      },
    });

    const map = new Map<string, string[]>();
    const addOpponent = (a: string, b: string) => {
      const list = map.get(a) ?? [];
      list.push(b);
      map.set(a, list);
    };

    for (const m of completedMatches) {
      addOpponent(m.whiteRegistrationId, m.blackRegistrationId);
      addOpponent(m.blackRegistrationId, m.whiteRegistrationId);
    }

    return map;
  }

  private async getScheduledRegistrationIdsInRound(
    eventId: string,
    roundNumber: number,
  ) {
    const matches = await this.prisma.chessMatch.findMany({
      where: {
        status: ChessMatchStatus.SCHEDULED,
        batch: { round: { eventId, roundNumber } },
      },
      select: {
        whiteRegistrationId: true,
        blackRegistrationId: true,
      },
    });

    const ids = new Set<string>();
    for (const m of matches) {
      ids.add(m.whiteRegistrationId);
      ids.add(m.blackRegistrationId);
    }
    return ids;
  }

  private async countEligiblePlayers(eventId: string) {
    return this.prisma.eventRegistration.count({
      where: {
        eventId,
        status: RegistrationStatus.CONFIRMED,
        attendedAt: { not: null },
        withdrawnAt: null,
      },
    });
  }

  private async countPlayersNeedingGameInRound(
    eventId: string,
    roundNumber: number,
  ) {
    const targetGamesCompleted = roundNumber - 1;
    const scheduledIds = await this.getScheduledRegistrationIdsInRound(
      eventId,
      roundNumber,
    );

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: RegistrationStatus.CONFIRMED,
        attendedAt: { not: null },
        withdrawnAt: null,
        gamesCompleted: targetGamesCompleted,
      },
      select: { id: true },
    });

    return registrations.filter((r) => !scheduledIds.has(r.id)).length;
  }

  private async findSinglePlayerNeedingGameInRound(
    eventId: string,
    roundNumber: number,
  ) {
    const targetGamesCompleted = roundNumber - 1;
    const scheduledIds = await this.getScheduledRegistrationIdsInRound(
      eventId,
      roundNumber,
    );

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: RegistrationStatus.CONFIRMED,
        attendedAt: { not: null },
        withdrawnAt: null,
        gamesCompleted: targetGamesCompleted,
      },
      select: { id: true, userId: true },
    });

    const waiting = registrations.filter((r) => !scheduledIds.has(r.id));
    return waiting.length === 1 ? waiting[0] : null;
  }

  /** Odd player out — counts as a win and one completed game for this round. */
  private async grantBye(registrationId: string) {
    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        gamesCompleted: { increment: 1 },
        eventWins: { increment: 1 },
      },
    });
  }

  private async countPlayersNeedingMoreGames(
    eventId: string,
    gamesPerPlayer: number,
  ) {
    return this.prisma.eventRegistration.count({
      where: {
        eventId,
        status: RegistrationStatus.CONFIRMED,
        attendedAt: { not: null },
        withdrawnAt: null,
        gamesCompleted: { lt: gamesPerPlayer },
      },
    });
  }

  private async getActiveBatch(eventId: string) {
    return this.prisma.chessRoundBatch.findFirst({
      where: {
        status: ChessBatchStatus.ACTIVE,
        round: { eventId },
      },
      include: {
        matches: true,
        round: true,
      },
      orderBy: [{ round: { roundNumber: 'desc' } }, { batchNumber: 'desc' }],
    });
  }

  private async finalizeMatchmaking(eventId: string) {
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      include: { game: true },
    });

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        eventId,
        status: RegistrationStatus.CONFIRMED,
        attendedAt: { not: null },
        withdrawnAt: null,
      },
    });

    const winPts = event.pointsReward;
    const lossPts = event.game?.lossPoints ?? 0;
    const drawPts = Math.floor(winPts / 2);

    await this.prisma.$transaction(async (tx) => {
      for (const reg of registrations) {
        let outcome: MatchOutcome;
        if (reg.eventWins >= 2) {
          outcome = MatchOutcome.WIN;
        } else if (reg.eventLosses >= 2) {
          outcome = MatchOutcome.LOSS;
        } else {
          outcome = MatchOutcome.DRAW;
        }

        const pointsEarned =
          outcome === MatchOutcome.WIN
            ? winPts
            : outcome === MatchOutcome.LOSS
              ? lossPts
              : drawPts;

        await tx.eventRegistration.update({
          where: { id: reg.id },
          data: { outcome, pointsEarned },
        });
      }

      await tx.event.update({
        where: { id: eventId },
        data: {
          matchmakingStatus: MatchmakingStatus.COMPLETED,
          status: EventStatus.COMPLETED,
        },
      });

      await tx.chessRoundBatch.updateMany({
        where: {
          status: ChessBatchStatus.ACTIVE,
          round: { eventId },
        },
        data: { status: ChessBatchStatus.COMPLETED },
      });
    });
  }

  private async getChessGameId() {
    const game = await this.prisma.game.findFirst({
      where: { name: CHESS_GAME_NAME, isActive: true },
    });
    if (!game) {
      throw new BadRequestException('Chess game not found in catalog.');
    }
    return game.id;
  }

  private async getChessEventOrThrow(
    eventId: string,
    user: User,
    allowPlayer = false,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { game: true, organizers: true },
    });

    if (!event) {
      throw new NotFoundException('Event not found.');
    }

    if (event.game?.name !== CHESS_GAME_NAME) {
      throw new BadRequestException('This event is not a chess event.');
    }

    if (user.role === UserRole.ADMIN) {
      return event;
    }

    if (user.role === UserRole.ORGANIZER) {
      const assigned = event.organizers.some((o) => o.userId === user.id);
      if (!assigned) {
        throw new ForbiddenException('You are not assigned to this event.');
      }
      return event;
    }

    if (allowPlayer && user.role === UserRole.PLAYER) {
      if (event.status !== EventStatus.PUBLISHED) {
        throw new ForbiddenException('Event is not available.');
      }
      const registered = await this.prisma.eventRegistration.findFirst({
        where: {
          eventId,
          userId: user.id,
          status: RegistrationStatus.CONFIRMED,
        },
      });
      if (!registered) {
        throw new ForbiddenException('You are not registered for this event.');
      }
      return event;
    }

    throw new ForbiddenException('Not allowed.');
  }

  private matchInclude() {
    return {
      whiteRegistration: {
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
      },
      blackRegistration: {
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
      },
      completedBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    } as const;
  }

  private toMatchResponse(
    match: {
      id: string;
      boardNumber: number;
      result: ChessMatchResult | null;
      status: ChessMatchStatus;
      completedAt: Date | null;
      batch?: {
        batchNumber?: number;
        round?: { roundNumber: number };
      };
      whiteRegistration: {
        id: string;
        userId: string;
        user: {
          id: string;
          firstName: string;
          lastName: string;
          username: string;
        };
      };
      blackRegistration: {
        id: string;
        userId: string;
        user: {
          id: string;
          firstName: string;
          lastName: string;
          username: string;
        };
      };
      completedBy?: {
        id: string;
        firstName: string;
        lastName: string;
      } | null;
    },
  ) {
    return {
      id: match.id,
      boardNumber: match.boardNumber,
      batchNumber: match.batch?.batchNumber ?? null,
      roundNumber: match.batch?.round?.roundNumber ?? null,
      gameNumber: match.batch?.round?.roundNumber ?? null,
      result: match.result,
      status: match.status,
      completedAt: match.completedAt,
      white: {
        registrationId: match.whiteRegistration.id,
        userId: match.whiteRegistration.userId,
        user: match.whiteRegistration.user,
      },
      black: {
        registrationId: match.blackRegistration.id,
        userId: match.blackRegistration.userId,
        user: match.blackRegistration.user,
      },
      completedBy: match.completedBy ?? null,
    };
  }
}
