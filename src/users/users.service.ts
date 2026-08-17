import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChessMatchResult,
  ChessMatchStatus,
  MatchOutcome,
  Prisma,
  RegistrationStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_PROFILES_PER_PHONE } from '../auth/profile.constants';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { formatDisplayName } from '../common/display-name';
import { rankMatchesPoints } from '../common/rank-tier';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import {
  CHESS_DRAW_POINTS,
  CHESS_LOSS_POINTS,
  CHESS_WIN_POINTS,
} from '../chess/chess-points';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  isProfileComplete(user: {
    gender: string | null;
    dateOfBirth: Date | null;
    city: string | null;
    state: string | null;
  }) {
    return Boolean(
      user.gender &&
        user.dateOfBirth &&
        (user.city?.trim() || user.state?.trim()),
    );
  }

  async myStats(user: User) {
    return this.statsForUserId(user.id);
  }

  async statsForUserId(userId: string) {
    await this.assertPlayerExists(userId);

    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        userId,
        status: RegistrationStatus.CONFIRMED,
        outcome: { not: null },
      },
      select: {
        outcome: true,
        pointsEarned: true,
        eventWins: true,
        eventLosses: true,
        eventDraws: true,
        gamesCompleted: true,
        event: {
          select: {
            sport: true,
            pointsReward: true,
            lossPoints: true,
          },
        },
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

      const perGamePlayed =
        row.eventWins + row.eventLosses + row.eventDraws;
      const points = this.pointsForRegistration(row);

      if (perGamePlayed > 0) {
        bucket.played += perGamePlayed;
        totals.played += perGamePlayed;
        bucket.won += row.eventWins;
        totals.won += row.eventWins;
        bucket.lost += row.eventLosses;
        totals.lost += row.eventLosses;
        bucket.draw += row.eventDraws;
        totals.draw += row.eventDraws;
      } else {
        bucket.played += 1;
        totals.played += 1;
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

      bucket.points += points;
      totals.points += points;
    }

    const bySport = [...bySportMap.values()].sort((a, b) =>
      b.points !== a.points ? b.points - a.points : a.sport.localeCompare(b.sport),
    );

    return { totals, bySport };
  }

  async findPlayerById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        gender: true,
        dateOfBirth: true,
        state: true,
        district: true,
        city: true,
        pincode: true,
        latitude: true,
        longitude: true,
        sportsInterested: true,
        schoolId: true,
        presentClass: true,
        company: true,
        createdAt: true,
        school: { select: { id: true, name: true, city: true } },
      },
    });

    if (!user || user.role !== UserRole.PLAYER) {
      throw new NotFoundException('Player not found.');
    }

    const [pointsMap, chessRating] = await Promise.all([
      this.getTotalPointsByUserIds([id]),
      this.getChessRatingForUser(id),
    ]);

    return {
      ...user,
      totalPoints: pointsMap.get(id) ?? 0,
      chessRating,
    };
  }

  async registrationsForUser(userId: string, query: PaginationQueryDto) {
    await this.assertPlayerExists(userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EventRegistrationWhereInput = {
      userId,
      status: RegistrationStatus.CONFIRMED,
    };

    const [data, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        select: {
          id: true,
          eventId: true,
          userId: true,
          status: true,
          registeredAt: true,
          outcome: true,
          pointsEarned: true,
          eventWins: true,
          eventLosses: true,
          eventDraws: true,
          gamesCompleted: true,
          event: {
            select: {
              id: true,
              name: true,
              sport: true,
              venue: true,
              startsAt: true,
              status: true,
              pointsReward: true,
              lossPoints: true,
            },
          },
        },
        orderBy: { registeredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.eventRegistration.count({ where }),
    ]);

    return {
      data: data.map((registration) => ({
        id: registration.id,
        eventId: registration.eventId,
        userId: registration.userId,
        status: registration.status,
        registeredAt: registration.registeredAt,
        outcome: registration.outcome,
        pointsEarned: this.pointsForRegistration(registration),
        eventWins: registration.eventWins,
        eventLosses: registration.eventLosses,
        eventDraws: registration.eventDraws,
        gamesCompleted: registration.gamesCompleted,
        event: {
          id: registration.event.id,
          name: registration.event.name,
          sport: registration.event.sport,
          venue: registration.event.venue,
          startsAt: registration.event.startsAt,
          status: registration.event.status,
        },
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async matchesForUser(userId: string, query: PaginationQueryDto) {
    await this.assertPlayerExists(userId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ChessMatchWhereInput = {
      status: ChessMatchStatus.COMPLETED,
      OR: [
        { whiteRegistration: { userId } },
        { blackRegistration: { userId } },
      ],
    };

    const [matches, total] = await Promise.all([
      this.prisma.chessMatch.findMany({
        where,
        include: {
          batch: {
            select: {
              batchNumber: true,
              round: {
                select: {
                  roundNumber: true,
                  event: {
                    select: { id: true, name: true, sport: true },
                  },
                },
              },
            },
          },
          whiteRegistration: {
            select: {
              id: true,
              userId: true,
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
            select: {
              id: true,
              userId: true,
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
        },
        orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.chessMatch.count({ where }),
    ]);

    return {
      data: matches.map((match) => this.toMatchResponse(match)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async getTotalPointsByUserIds(
    userIds: string[],
  ): Promise<Map<string, number>> {
    if (!userIds.length) return new Map();

    const rows = await this.prisma.eventRegistration.findMany({
      where: {
        userId: { in: userIds },
        status: RegistrationStatus.CONFIRMED,
        outcome: { not: null },
      },
      select: {
        userId: true,
        pointsEarned: true,
        eventWins: true,
        eventLosses: true,
        eventDraws: true,
        event: {
          select: {
            pointsReward: true,
            lossPoints: true,
            sport: true,
            game: { select: { name: true } },
          },
        },
      },
    });

    const totals = new Map<string, number>();
    for (const id of userIds) {
      totals.set(id, 0);
    }
    for (const row of rows) {
      const current = totals.get(row.userId) ?? 0;
      totals.set(row.userId, current + this.pointsForRegistration(row));
    }
    return totals;
  }

  /** Overall points from each game when available; otherwise event outcome points. */
  private pointsForRegistration(row: {
    pointsEarned: number;
    eventWins: number;
    eventLosses: number;
    eventDraws: number;
    event: {
      pointsReward: number;
      lossPoints: number;
      sport: string;
      game?: { name: string } | null;
    };
  }) {
    const perGamePlayed =
      row.eventWins + row.eventLosses + row.eventDraws;
    if (perGamePlayed <= 0) return row.pointsEarned;

    const isChess =
      row.event.game?.name === 'Chess' || row.event.sport === 'Chess';
    const winPts = isChess ? CHESS_WIN_POINTS : row.event.pointsReward;
    const lossPts = isChess
      ? CHESS_LOSS_POINTS
      : (row.event.lossPoints ?? 0);
    const drawPts = isChess
      ? CHESS_DRAW_POINTS
      : Math.floor(winPts / 2);
    return (
      row.eventWins * winPts +
      row.eventDraws * drawPts +
      row.eventLosses * lossPts
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
      displayName: formatDisplayName(u.firstName, u.lastName),
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

    let companyUpdate: string | null | undefined = undefined;
    if (dto.company !== undefined) {
      companyUpdate = dto.company?.trim() || null;
    }

    // Student ↔ open: linking a school clears company; setting company clears school.
    if (schoolIdUpdate) {
      companyUpdate = null;
    } else if (companyUpdate) {
      schoolIdUpdate = null;
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim(), lastName: '' }
          : {}),
        ...(dto.lastName !== undefined && dto.firstName === undefined
          ? { lastName: dto.lastName }
          : {}),
        email: emailUpdate,
        phone: dto.phone,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        state: dto.state,
        district: dto.district,
        city: dto.city,
        pincode: dto.pincode,
        latitude: dto.latitude,
        longitude: dto.longitude,
        sportsInterested: dto.sportsInterested,
        ...(companyUpdate !== undefined ? { company: companyUpdate } : {}),
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

    const listSelect = {
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
      latitude: true,
      longitude: true,
      schoolId: true,
      presentClass: true,
      company: true,
      createdAt: true,
      school: { select: { id: true, name: true } },
    } as const;

    if (query.rank) {
      const matched = await this.prisma.user.findMany({
        where,
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
      const pointsMap = await this.getTotalPointsByUserIds(
        matched.map((row) => row.id),
      );
      const filteredIds = matched
        .filter((row) =>
          rankMatchesPoints(query.rank!, pointsMap.get(row.id) ?? 0),
        )
        .map((row) => row.id);

      const total = filteredIds.length;
      const pageIds = filteredIds.slice(skip, skip + limit);
      const rows =
        pageIds.length === 0
          ? []
          : await this.prisma.user.findMany({
              where: { id: { in: pageIds } },
              select: listSelect,
            });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const ordered = pageIds
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      return {
        data: ordered.map((row) => ({
          ...row,
          totalPoints: pointsMap.get(row.id) ?? 0,
        })),
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 0,
        },
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const pointsMap = await this.getTotalPointsByUserIds(rows.map((row) => row.id));
    const data = rows.map((row) => ({
      ...row,
      totalPoints: pointsMap.get(row.id) ?? 0,
    }));

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

  private async assertPlayerExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user || user.role !== UserRole.PLAYER) {
      throw new NotFoundException('Player not found.');
    }
  }

  private async getChessRatingForUser(userId: string) {
    const game = await this.prisma.game.findFirst({
      where: {
        name: { equals: 'Chess', mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true },
    });
    if (!game) return null;

    const rating = await this.prisma.playerGameRating.findUnique({
      where: {
        userId_gameId: { userId, gameId: game.id },
      },
      select: {
        rating: true,
        gamesPlayed: true,
        wins: true,
        losses: true,
        draws: true,
      },
    });

    return rating;
  }

  private toMatchResponse(
    match: {
      id: string;
      boardNumber: number;
      result: ChessMatchResult | null;
      status: ChessMatchStatus;
      completedAt: Date | null;
      whiteRatingBefore: number | null;
      whiteRatingAfter: number | null;
      blackRatingBefore: number | null;
      blackRatingAfter: number | null;
      batch?: {
        batchNumber?: number;
        round?: {
          roundNumber: number;
          event?: { id: string; name: string; sport: string };
        };
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
    },
  ) {
    const event = match.batch?.round?.event;
    return {
      id: match.id,
      boardNumber: match.boardNumber,
      batchNumber: match.batch?.batchNumber ?? null,
      roundNumber: match.batch?.round?.roundNumber ?? null,
      result: match.result,
      status: match.status,
      completedAt: match.completedAt,
      event: event
        ? { id: event.id, name: event.name, sport: event.sport }
        : null,
      white: {
        registrationId: match.whiteRegistration.id,
        userId: match.whiteRegistration.userId,
        user: match.whiteRegistration.user,
        ratingBefore: match.whiteRatingBefore,
        ratingAfter: match.whiteRatingAfter,
        ratingDelta:
          match.whiteRatingBefore != null && match.whiteRatingAfter != null
            ? match.whiteRatingAfter - match.whiteRatingBefore
            : null,
      },
      black: {
        registrationId: match.blackRegistration.id,
        userId: match.blackRegistration.userId,
        user: match.blackRegistration.user,
        ratingBefore: match.blackRatingBefore,
        ratingAfter: match.blackRatingAfter,
        ratingDelta:
          match.blackRatingBefore != null && match.blackRatingAfter != null
            ? match.blackRatingAfter - match.blackRatingBefore
            : null,
      },
    };
  }
}
