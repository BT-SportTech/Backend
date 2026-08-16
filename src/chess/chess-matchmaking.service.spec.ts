import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ChessMatchStatus,
  EventStatus,
  MatchmakingStatus,
  RegistrationStatus,
  UserRole,
} from '@prisma/client';
import { ChessMatchmakingService } from './chess-matchmaking.service';
import { ChessRatingService } from './chess-rating.service';

describe('ChessMatchmakingService', () => {
  const chessGame = {
    id: 'game-chess',
    name: 'Chess',
    isActive: true,
  };

  const organizer = {
    id: 'org-1',
    role: UserRole.ORGANIZER,
  };

  const chessEvent = {
    id: 'event-1',
    status: EventStatus.PUBLISHED,
    gameId: chessGame.id,
    game: chessGame,
    boardCount: 2,
    gamesPerPlayer: 3,
    matchmakingStatus: MatchmakingStatus.NOT_STARTED,
    pointsReward: 50,
    organizers: [{ userId: organizer.id }],
  };

  let prisma: {
    event: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    eventRegistration: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    chessRound: { create: jest.Mock; update: jest.Mock };
    chessRoundBatch: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    chessMatch: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    playerGameRating: { findMany: jest.Mock };
    game: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  let service: ChessMatchmakingService;

  beforeEach(() => {
    prisma = {
      event: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      eventRegistration: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      chessRound: {
        create: jest.fn(),
        update: jest.fn(),
      },
      chessRoundBatch: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      chessMatch: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      playerGameRating: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      game: {
        findFirst: jest.fn().mockResolvedValue(chessGame),
      },
      $transaction: jest.fn((fn) =>
        typeof fn === 'function' ? fn(prisma) : Promise.all(fn),
      ),
    };

    service = new ChessMatchmakingService(
      prisma as never,
      new ChessRatingService(prisma as never),
      { getTotalPointsByUserIds: jest.fn() } as never,
    );
  });

  describe('startMatchmaking', () => {
    it('rejects non-chess events', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...chessEvent,
        game: { name: 'Football' },
      });

      await expect(
        service.startMatchmaking('event-1', organizer as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unassigned organizers', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...chessEvent,
        organizers: [],
      });

      await expect(
        service.startMatchmaking('event-1', organizer as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('starts matchmaking and creates round 1 batch 1', async () => {
      prisma.event.findUnique.mockResolvedValue(chessEvent);
      prisma.eventRegistration.count.mockResolvedValue(4);
      prisma.event.update.mockResolvedValue(chessEvent);
      prisma.chessRound.create.mockResolvedValue({
        id: 'round-1',
        roundNumber: 1,
      });
      prisma.eventRegistration.findMany.mockResolvedValue([
        {
          id: 'reg-1',
          userId: 'u1',
          eventWins: 0,
          eventLosses: 0,
          eventDraws: 0,
          whiteGames: 0,
          blackGames: 0,
          user: { id: 'u1', dateOfBirth: new Date('2010-01-01') },
        },
        {
          id: 'reg-2',
          userId: 'u2',
          eventWins: 0,
          eventLosses: 0,
          eventDraws: 0,
          whiteGames: 0,
          blackGames: 0,
          user: { id: 'u2', dateOfBirth: new Date('2011-01-01') },
        },
      ]);
      prisma.chessRoundBatch.create.mockResolvedValue({
        id: 'batch-1',
        batchNumber: 1,
        boardCount: 2,
        matches: [
          {
            id: 'match-1',
            boardNumber: 1,
            result: null,
            status: ChessMatchStatus.SCHEDULED,
            completedAt: null,
            whiteRegistration: {
              id: 'reg-1',
              userId: 'u1',
              user: {
                id: 'u1',
                firstName: 'A',
                lastName: 'One',
                username: 'aone',
              },
            },
            blackRegistration: {
              id: 'reg-2',
              userId: 'u2',
              user: {
                id: 'u2',
                firstName: 'B',
                lastName: 'Two',
                username: 'btwo',
              },
            },
            completedBy: null,
          },
        ],
        round: { roundNumber: 1 },
      });

      const result = await service.startMatchmaking(
        'event-1',
        organizer as never,
      );

      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            matchmakingStatus: MatchmakingStatus.IN_PROGRESS,
          }),
        }),
      );
      expect(result.roundNumber).toBe(1);
      expect(result.batchNumber).toBe(1);
      expect(result.matches).toHaveLength(1);
    });
  });

  describe('withdrawPlayer', () => {
    it('withdraws attended player and cancels scheduled matches', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...chessEvent,
        matchmakingStatus: MatchmakingStatus.IN_PROGRESS,
      });
      prisma.eventRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        attendedAt: new Date(),
        withdrawnAt: null,
        status: RegistrationStatus.CONFIRMED,
      });
      prisma.chessMatch.findMany.mockResolvedValue([
        { id: 'match-1', status: ChessMatchStatus.SCHEDULED },
      ]);
      prisma.eventRegistration.update.mockResolvedValue({
        id: 'reg-1',
        userId: 'u1',
        attendedAt: new Date(),
        withdrawnAt: new Date(),
        withdrawnById: organizer.id,
        user: {
          id: 'u1',
          firstName: 'A',
          lastName: 'One',
          username: 'aone',
        },
      });
      prisma.eventRegistration.findUniqueOrThrow.mockResolvedValue({
        id: 'reg-1',
        userId: 'u1',
        attendedAt: new Date(),
        withdrawnAt: new Date(),
        withdrawnById: organizer.id,
        user: {
          id: 'u1',
          firstName: 'A',
          lastName: 'One',
          username: 'aone',
        },
      });

      const result = await service.withdrawPlayer(
        'event-1',
        'reg-1',
        organizer as never,
      );

      expect(result.withdrawnAt).toBeTruthy();
      expect(result.attendedAt).toBeTruthy();
      expect(prisma.chessMatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ChessMatchStatus.CANCELLED },
        }),
      );
    });

    it('rejects withdrawing players who were not marked attended', async () => {
      prisma.event.findUnique.mockResolvedValue({
        ...chessEvent,
        matchmakingStatus: MatchmakingStatus.IN_PROGRESS,
      });
      prisma.eventRegistration.findFirst.mockResolvedValue({
        id: 'reg-1',
        attendedAt: null,
        withdrawnAt: null,
      });

      await expect(
        service.withdrawPlayer('event-1', 'reg-1', organizer as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
