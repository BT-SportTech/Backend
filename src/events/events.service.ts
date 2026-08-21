import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgeCategory,
  EventStatus,
  MatchOutcome,
  Prisma,
  RegistrationStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../notifications/push-notifications.service';
import { EventPushSchedulerService } from '../notifications/event-push-scheduler.service';
import { UsersService } from '../users/users.service';
import { CreateEventDto } from './dto/create-event.dto';
import { EventQueryDto } from './dto/event-query.dto';
import { SetEventResultsDto } from './dto/set-event-results.dto';
import { SetRegistrationResultDto } from './dto/set-registration-result.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { RegisterEventDto } from './dto/register-event.dto';
import {
  CHESS_DRAW_POINTS,
  CHESS_LOSS_POINTS,
  CHESS_WIN_POINTS,
} from '../chess/chess-points';

const eventInclude = {
  schools: {
    include: {
      school: { select: { id: true, name: true, code: true } },
    },
  },
  organizers: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          username: true,
        },
      },
    },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  game: true,
  _count: {
    select: {
      registrations: { where: { status: RegistrationStatus.CONFIRMED } },
    },
  },
} satisfies Prisma.EventInclude;

type EventWithRelations = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly eventPushScheduler: EventPushSchedulerService,
  ) {}

  async create(dto: CreateEventDto, adminId: string) {
    this.assertDateLogic(dto);
    this.assertZonePairing(dto.state, dto.district);

    if (dto.schoolIds?.length) {
      await this.assertSchoolsExist(dto.schoolIds);
    }
    if (dto.organizerIds?.length) {
      await this.assertOrganizersExist(dto.organizerIds);
    }

    const game = await this.requireActiveGame(dto.gameId);
    this.assertChessBoardCount(game.name, dto.boardCount);

    const {
      schoolIds,
      organizerIds,
      genders,
      fee,
      pointsReward,
      lossPoints,
      gameId,
      state,
      district,
      boardCount,
      gamesPerPlayer,
      ...rest
    } = dto;

    return this.prisma.event
      .create({
        data: {
          name: rest.name,
          description: rest.description,
          venue: rest.venue,
          imageUrl: rest.imageUrl,
          ageCategory: rest.ageCategory,
          maxParticipants: rest.maxParticipants,
          startsAt: new Date(dto.startsAt),
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          registrationOpensAt: new Date(dto.registrationOpensAt),
          registrationClosesAt: new Date(dto.registrationClosesAt),
          genders: genders ?? [],
          fee: fee ?? 0,
          pointsReward:
            game.name === 'Chess'
              ? CHESS_WIN_POINTS
              : (pointsReward ?? game.winPoints),
          lossPoints:
            game.name === 'Chess'
              ? CHESS_LOSS_POINTS
              : (lossPoints ?? game.lossPoints),
          status: EventStatus.DRAFT,
          createdById: adminId,
          gameId: game.id,
          sport: game.name,
          state: this.normalizeZone(state),
          district: this.normalizeZone(district),
          boardCount: boardCount ?? null,
          gamesPerPlayer: gamesPerPlayer ?? 3,
          schools: schoolIds?.length
            ? { create: schoolIds.map((schoolId) => ({ schoolId })) }
            : undefined,
          organizers: organizerIds?.length
            ? { create: organizerIds.map((userId) => ({ userId })) }
            : undefined,
        },
        include: eventInclude,
      })
      .then((e) => this.toEventResponse(e));
  }

  async findAllAdmin(query: EventQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.sport
        ? { sport: { equals: query.sport, mode: 'insensitive' } }
        : {}),
      ...(query.state
        ? { state: { equals: query.state, mode: 'insensitive' } }
        : {}),
      ...(query.district
        ? { district: { equals: query.district, mode: 'insensitive' } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { sport: { contains: query.search, mode: 'insensitive' } },
              { venue: { contains: query.search, mode: 'insensitive' } },
              { state: { contains: query.search, mode: 'insensitive' } },
              { district: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: eventInclude,
        orderBy: { startsAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      data: rows.map((e) => this.toEventResponse(e)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findOne(id: string, user: User) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: eventInclude,
    });
    if (!event) throw new NotFoundException('Event not found.');

    if (user.role === UserRole.ADMIN) {
      return this.toEventResponse(event);
    }

    if (user.role === UserRole.ORGANIZER) {
      const assigned = event.organizers.some((o) => o.userId === user.id);
      if (!assigned) {
        throw new ForbiddenException('You are not assigned to this event.');
      }
      return this.toEventResponse(event);
    }

    if (user.role === UserRole.PLAYER) {
      if (event.status !== EventStatus.PUBLISHED) {
        throw new ForbiddenException('Event is not available.');
      }

      const isRegistered = await this.isUserRegistered(event.id, user.id);
      return this.toEventResponse(event, isRegistered);
    }

    throw new ForbiddenException('Only players and admins can view events.');
  }

  async update(id: string, dto: UpdateEventDto) {
    const event = await this.getEventOrThrow(id);

    if (
      event.status === EventStatus.COMPLETED ||
      event.status === EventStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot update an event with status ${event.status}.`,
      );
    }

    const merged = {
      startsAt: dto.startsAt ?? event.startsAt.toISOString(),
      endsAt: dto.endsAt ?? event.endsAt?.toISOString(),
      registrationOpensAt:
        dto.registrationOpensAt ?? event.registrationOpensAt.toISOString(),
      registrationClosesAt:
        dto.registrationClosesAt ?? event.registrationClosesAt.toISOString(),
    };
    this.assertDateLogic(merged);
    const mergedState = dto.state !== undefined ? dto.state : event.state;
    const mergedDistrict =
      dto.district !== undefined ? dto.district : event.district;
    this.assertZonePairing(mergedState, mergedDistrict);

    if (dto.schoolIds?.length) {
      await this.assertSchoolsExist(dto.schoolIds);
    }
    if (dto.organizerIds?.length) {
      await this.assertOrganizersExist(dto.organizerIds);
    }

    let gameSport: string | undefined;
    let gameWinPoints: number | undefined;
    let gameLossPoints: number | undefined;
    let resolvedGameName = event.game?.name;
    if (dto.gameId) {
      const game = await this.requireActiveGame(dto.gameId);
      gameSport = game.name;
      gameWinPoints = game.winPoints;
      gameLossPoints = game.lossPoints;
      resolvedGameName = game.name;
    }

    const effectiveBoardCount =
      dto.boardCount !== undefined ? dto.boardCount : event.boardCount;
    this.assertChessBoardCount(resolvedGameName, effectiveBoardCount);

    const { schoolIds, organizerIds, boardCount, gamesPerPlayer, ...rest } = dto;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (schoolIds !== undefined) {
        await tx.eventSchool.deleteMany({ where: { eventId: id } });
        if (schoolIds.length) {
          await tx.eventSchool.createMany({
            data: schoolIds.map((schoolId) => ({ eventId: id, schoolId })),
          });
        }
      }

      if (organizerIds !== undefined) {
        await tx.eventOrganizer.deleteMany({ where: { eventId: id } });
        if (organizerIds.length) {
          await tx.eventOrganizer.createMany({
            data: organizerIds.map((userId) => ({ eventId: id, userId })),
          });
        }
      }

      return tx.event.update({
        where: { id },
        data: {
          ...(rest.name !== undefined ? { name: rest.name } : {}),
          ...(rest.gameId !== undefined ? { gameId: rest.gameId } : {}),
          ...(gameSport !== undefined ? { sport: gameSport } : {}),
          ...(rest.description !== undefined
            ? { description: rest.description }
            : {}),
          ...(rest.venue !== undefined ? { venue: rest.venue } : {}),
          ...(rest.startsAt !== undefined
            ? { startsAt: new Date(rest.startsAt) }
            : {}),
          ...(rest.endsAt !== undefined
            ? { endsAt: rest.endsAt ? new Date(rest.endsAt) : null }
            : {}),
          ...(rest.registrationOpensAt !== undefined
            ? { registrationOpensAt: new Date(rest.registrationOpensAt) }
            : {}),
          ...(rest.registrationClosesAt !== undefined
            ? { registrationClosesAt: new Date(rest.registrationClosesAt) }
            : {}),
          ...(rest.maxParticipants !== undefined
            ? { maxParticipants: rest.maxParticipants }
            : {}),
          ...(rest.state !== undefined
            ? { state: this.normalizeZone(rest.state) }
            : {}),
          ...(rest.district !== undefined
            ? { district: this.normalizeZone(rest.district) }
            : {}),
          ...(rest.ageCategory !== undefined
            ? { ageCategory: rest.ageCategory }
            : {}),
          ...(rest.genders !== undefined ? { genders: rest.genders } : {}),
          ...(rest.fee !== undefined ? { fee: rest.fee } : {}),
          ...(resolvedGameName === 'Chess'
            ? {
                pointsReward: CHESS_WIN_POINTS,
                lossPoints: CHESS_LOSS_POINTS,
              }
            : {
                ...(rest.pointsReward !== undefined
                  ? { pointsReward: rest.pointsReward }
                  : gameWinPoints !== undefined
                    ? { pointsReward: gameWinPoints }
                    : {}),
                ...(rest.lossPoints !== undefined
                  ? { lossPoints: rest.lossPoints }
                  : gameLossPoints !== undefined
                    ? { lossPoints: gameLossPoints }
                    : {}),
              }),
          ...(rest.imageUrl !== undefined ? { imageUrl: rest.imageUrl } : {}),
          ...(boardCount !== undefined ? { boardCount } : {}),
          ...(gamesPerPlayer !== undefined ? { gamesPerPlayer } : {}),
        },
        include: eventInclude,
      });
    });

    if (dto.startsAt !== undefined) {
      this.eventPushScheduler.rescheduleEventReminders(id);
    }

    return this.toEventResponse(updated);
  }

  async publish(id: string) {
    const event = await this.getEventOrThrow(id);

    if (event.status === EventStatus.PUBLISHED) {
      return this.toEventResponse(event);
    }
    if (
      event.status === EventStatus.COMPLETED ||
      event.status === EventStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot publish an event with status ${event.status}.`,
      );
    }

    this.assertDateLogic({
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt?.toISOString(),
      registrationOpensAt: event.registrationOpensAt.toISOString(),
      registrationClosesAt: event.registrationClosesAt.toISOString(),
    });

    if (!event.name?.trim() || !event.sport?.trim() || !event.venue?.trim()) {
      throw new BadRequestException(
        'Event name, sport, and venue are required to publish.',
      );
    }

    this.assertChessBoardCount(event.game?.name, event.boardCount);

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PUBLISHED },
      include: eventInclude,
    });
    this.eventPushScheduler.notifyEligiblePlayersOnPublish(updated);
    return this.toEventResponse(updated);
  }

  async complete(id: string) {
    const event = await this.getEventOrThrow(id);
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Only published events can be completed.');
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.COMPLETED },
      include: eventInclude,
    });
    return this.toEventResponse(updated);
  }

  /** Bulk-set outcomes for confirmed registrations and mark event COMPLETED. */
  async setResults(eventId: string, dto: SetEventResultsDto) {
    const event = await this.getEventOrThrow(eventId);
    if (
      event.status !== EventStatus.PUBLISHED &&
      event.status !== EventStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Results can only be set for published or completed events.',
      );
    }

    const confirmed = await this.prisma.eventRegistration.findMany({
      where: { eventId, status: RegistrationStatus.CONFIRMED },
    });
    const byUser = new Map(confirmed.map((r) => [r.userId, r]));

    for (const item of dto.results) {
      if (!byUser.has(item.userId)) {
        throw new BadRequestException(
          `User ${item.userId} is not a confirmed registrant.`,
        );
      }
    }

    const isChess = event.game?.name === 'Chess' || event.sport === 'Chess';
    const winPts = isChess ? CHESS_WIN_POINTS : event.pointsReward;
    const lossPts = isChess ? CHESS_LOSS_POINTS : (event.lossPoints ?? 0);
    const drawPts = isChess ? CHESS_DRAW_POINTS : Math.floor(winPts / 2);

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.results) {
        const pointsEarned =
          item.outcome === MatchOutcome.WIN
            ? winPts
            : item.outcome === MatchOutcome.LOSS
              ? lossPts
              : drawPts;
        await tx.eventRegistration.update({
          where: {
            eventId_userId: { eventId, userId: item.userId },
          },
          data: { outcome: item.outcome, pointsEarned },
        });
      }
      if (event.status !== EventStatus.COMPLETED) {
        await tx.event.update({
          where: { id: eventId },
          data: { status: EventStatus.COMPLETED },
        });
      }
    });

    return this.listRegistrationsAdmin(eventId);
  }

  async setRegistrationResult(
    eventId: string,
    registrationId: string,
    dto: SetRegistrationResultDto,
  ) {
    const event = await this.getEventOrThrow(eventId);
    if (
      event.status !== EventStatus.PUBLISHED &&
      event.status !== EventStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Results can only be set for published or completed events.',
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
      throw new NotFoundException('Registration not found for this event.');
    }

    const isChess = event.game?.name === 'Chess' || event.sport === 'Chess';
    const winPts = isChess ? CHESS_WIN_POINTS : event.pointsReward;
    const lossPts = isChess ? CHESS_LOSS_POINTS : (event.lossPoints ?? 0);
    const drawPts = isChess ? CHESS_DRAW_POINTS : Math.floor(winPts / 2);
    const pointsEarned =
      dto.outcome === MatchOutcome.WIN
        ? winPts
        : dto.outcome === MatchOutcome.LOSS
          ? lossPts
          : drawPts;

    const updated = await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { outcome: dto.outcome, pointsEarned },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      status: updated.status,
      outcome: updated.outcome,
      pointsEarned: updated.pointsEarned,
      registeredAt: updated.registeredAt,
      user: updated.user,
    };
  }

  async listRegistrationsAdmin(eventId: string) {
    await this.getEventOrThrow(eventId);
    return this.listRegistrations(eventId);
  }

  async listRegistrationsForUser(eventId: string, user: User) {
    await this.getEventOrThrow(eventId);
    if (user.role === UserRole.ADMIN) {
      return this.listRegistrations(eventId);
    }
    if (user.role === UserRole.ORGANIZER) {
      await this.assertOrganizerAssigned(eventId, user.id);
      return this.listRegistrationsForOrganizer(eventId);
    }
    throw new ForbiddenException('Not allowed to view registrations.');
  }

  async findMineForOrganizer(user: User) {
    if (user.role !== UserRole.ORGANIZER) {
      throw new ForbiddenException('Only organizers can list assigned events.');
    }

    const rows = await this.prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        organizers: { some: { userId: user.id } },
      },
      include: eventInclude,
      orderBy: { startsAt: 'asc' },
    });

    return {
      data: rows.map((e) => this.toOrganizerEventResponse(e)),
    };
  }

  async findHistoryForOrganizer(user: User) {
    if (user.role !== UserRole.ORGANIZER) {
      throw new ForbiddenException('Only organizers can list assigned events.');
    }

    const rows = await this.prisma.event.findMany({
      where: {
        status: { in: [EventStatus.COMPLETED, EventStatus.CANCELLED] },
        organizers: { some: { userId: user.id } },
      },
      include: eventInclude,
      orderBy: { startsAt: 'desc' },
    });

    return {
      data: rows.map((e) => this.toOrganizerEventResponse(e)),
      meta: { total: rows.length },
    };
  }

  async setAttendance(
    eventId: string,
    registrationId: string,
    attended: boolean,
    user: User,
  ) {
    const event = await this.getEventOrThrow(eventId);

    if (user.role === UserRole.ORGANIZER) {
      await this.assertOrganizerAssigned(eventId, user.id);
    } else if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Not allowed to mark attendance.');
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        'Attendance can only be marked for published events.',
      );
    }

    this.assertAttendanceWindow(event.startsAt);

    const registration = await this.prisma.eventRegistration.findFirst({
      where: {
        id: registrationId,
        eventId,
        status: RegistrationStatus.CONFIRMED,
      },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found for this event.');
    }

    const updated = await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: attended
        ? { attendedAt: new Date(), attendedById: user.id }
        : { attendedAt: null, attendedById: null },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
          },
        },
        attendedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      status: updated.status,
      outcome: updated.outcome,
      pointsEarned: updated.pointsEarned,
      registeredAt: updated.registeredAt,
      attendedAt: updated.attendedAt,
      attendedById: updated.attendedById,
      attendedBy: updated.attendedBy,
      user: updated.user,
    };
  }

  private async listRegistrationsForOrganizer(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) throw new NotFoundException('Event not found.');

    const attendanceWindowOpen = this.isAttendanceWindowOpen(
      event.startsAt,
      event.status,
    );
    const attendanceOpensAt = new Date(
      event.startsAt.getTime() - 30 * 60 * 1000,
    );

    if (!attendanceWindowOpen) {
      return {
        eventId,
        data: [],
        attendanceWindowOpen,
        attendanceOpensAt,
      };
    }

    const rows = await this.prisma.eventRegistration.findMany({
      where: { eventId, status: RegistrationStatus.CONFIRMED },
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
      orderBy: { registeredAt: 'asc' },
    });

    return {
      eventId,
      data: rows.map((r) => ({
        id: r.id,
        attendedAt: r.attendedAt,
        user: r.user,
      })),
      attendanceWindowOpen,
      attendanceOpensAt,
    };
  }

  private async listRegistrations(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: { game: true },
    });
    if (!event) throw new NotFoundException('Event not found.');

    const rows = await this.prisma.eventRegistration.findMany({
      where: { eventId, status: RegistrationStatus.CONFIRMED },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
            dateOfBirth: true,
          },
        },
        attendedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        withdrawnBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { registeredAt: 'asc' },
    });

    const chessRatings =
      event.game?.name === 'Chess' && event.gameId
        ? await this.prisma.playerGameRating.findMany({
            where: {
              gameId: event.gameId,
              userId: { in: rows.map((r) => r.userId) },
            },
          })
        : [];
    const ratingByUser = new Map(chessRatings.map((r) => [r.userId, r]));
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const totalPointsByUser =
      await this.usersService.getTotalPointsByUserIds(userIds);

    return {
      eventId,
      data: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        status: r.status,
        outcome: r.outcome,
        pointsEarned: r.pointsEarned,
        registeredAt: r.registeredAt,
        attendedAt: r.attendedAt,
        attendedById: r.attendedById,
        attendedBy: r.attendedBy,
        withdrawnAt: r.withdrawnAt,
        withdrawnById: r.withdrawnById,
        withdrawnBy: r.withdrawnBy,
        eventWins: r.eventWins,
        eventLosses: r.eventLosses,
        eventDraws: r.eventDraws,
        gamesCompleted: r.gamesCompleted,
        whiteGames: r.whiteGames,
        blackGames: r.blackGames,
        chessRating: ratingByUser.get(r.userId)?.rating ?? null,
        user: {
          ...r.user,
          totalPoints: totalPointsByUser.get(r.userId) ?? 0,
        },
      })),
      attendanceWindowOpen: this.isAttendanceWindowOpen(
        event.startsAt,
        event.status,
      ),
      attendanceOpensAt: new Date(event.startsAt.getTime() - 30 * 60 * 1000),
    };
  }

  private async assertOrganizerAssigned(eventId: string, userId: string) {
    const assignment = await this.prisma.eventOrganizer.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!assignment) {
      throw new ForbiddenException('You are not assigned to this event.');
    }
  }

  private async assertOrganizersExist(organizerIds: string[]) {
    const found = await this.prisma.user.findMany({
      where: { id: { in: organizerIds }, role: UserRole.ORGANIZER },
      select: { id: true },
    });
    if (found.length !== organizerIds.length) {
      this.fieldError(
        'organizerIds',
        'One or more organizer IDs are invalid or not organizers.',
      );
    }
  }

  private assertAttendanceWindow(startsAt: Date) {
    if (!this.isAttendanceWindowOpen(startsAt, EventStatus.PUBLISHED)) {
      throw new BadRequestException(
        'Attendance opens 30 minutes before the event starts.',
      );
    }
  }

  private isAttendanceWindowOpen(startsAt: Date, status: EventStatus) {
    if (status !== EventStatus.PUBLISHED) return false;
    const opensAt = new Date(startsAt.getTime() - 30 * 60 * 1000);
    return new Date() >= opensAt;
  }

  async cancel(id: string) {
    const event = await this.getEventOrThrow(id);
    if (
      event.status === EventStatus.COMPLETED ||
      event.status === EventStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel an event with status ${event.status}.`,
      );
    }
    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
      include: eventInclude,
    });
    this.eventPushScheduler.cancelEventReminders(id);
    return this.toEventResponse(updated);
  }

  async findEligible(user: User, query: EventQueryDto) {
    if (user.role !== UserRole.PLAYER) {
      throw new ForbiddenException('Only players can list eligible events.');
    }

    // Show all published events; eligibility is enforced at registration.
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {
      status: EventStatus.PUBLISHED,
      ...(query.sport
        ? { sport: { equals: query.sport, mode: 'insensitive' } }
        : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { sport: { contains: query.search, mode: 'insensitive' } },
                  { venue: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };

    const [candidates, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: eventInclude,
        orderBy: { startsAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        userId: user.id,
        status: RegistrationStatus.CONFIRMED,
        eventId: { in: candidates.map((e) => e.id) },
      },
      select: { eventId: true },
    });
    const registeredIds = new Set(registrations.map((r) => r.eventId));

    return {
      data: candidates.map((e) =>
        this.toEventResponse(e, registeredIds.has(e.id)),
      ),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async register(eventId: string, user: User, dto: RegisterEventDto = {}) {
    if (user.role !== UserRole.PLAYER) {
      throw new ForbiddenException('Only players can register for events.');
    }

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventInclude,
    });
    if (!event) throw new NotFoundException('Event not found.');

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Event is not open for registration.');
    }

    this.assertRegistrationProfile(user, event);

    const ineligibleReason = this.getIneligibilityReason(user, event);
    if (ineligibleReason) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'NOT_ELIGIBLE',
        message: ineligibleReason,
      });
    }

    const now = new Date();
    if (now < event.registrationOpensAt) {
      throw new BadRequestException('Registration has not opened yet.');
    }
    if (now > event.registrationClosesAt) {
      throw new BadRequestException('Registration deadline has passed.');
    }

    const confirmedCount = event._count.registrations;
    if (confirmedCount >= event.maxParticipants) {
      throw new BadRequestException('Event is full.');
    }

    const paymentData = this.buildRegistrationPaymentData(event.fee, dto);

    const existing = await this.prisma.eventRegistration.findUnique({
      where: {
        eventId_userId: { eventId, userId: user.id },
      },
    });

    if (existing) {
      if (existing.status === RegistrationStatus.CONFIRMED) {
        throw new ConflictException('Already registered for this event.');
      }
      const revived = await this.prisma.eventRegistration.update({
        where: { id: existing.id },
        data: {
          status: RegistrationStatus.CONFIRMED,
          registeredAt: new Date(),
          ...paymentData,
        },
        include: {
          event: { include: eventInclude },
        },
      });
      this.notifyRegistrationConfirmed(user.id, event);
      this.eventPushScheduler.scheduleRegistrationReminders(event, user.id);
      return this.toRegistrationResponse(revived, event);
    }

    try {
      const created = await this.prisma.eventRegistration.create({
        data: {
          eventId,
          userId: user.id,
          status: RegistrationStatus.CONFIRMED,
          ...paymentData,
        },
        include: {
          event: { include: eventInclude },
        },
      });
      this.notifyRegistrationConfirmed(user.id, event);
      this.eventPushScheduler.scheduleRegistrationReminders(event, user.id);
      return this.toRegistrationResponse(created, event);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Already registered for this event.');
      }
      throw err;
    }
  }

  async myRegistrations(user: User, query: EventQueryDto) {
    if (user.role !== UserRole.PLAYER) {
      throw new ForbiddenException('Only players can view their registrations.');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EventRegistrationWhereInput = {
      userId: user.id,
      status: RegistrationStatus.CONFIRMED,
    };

    const [data, total] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where,
        include: {
          event: { include: eventInclude },
        },
        orderBy: { registeredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.eventRegistration.count({ where }),
    ]);

    return {
      data: data.map((r) => this.toRegistrationResponse(r, r.event, true)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async getEventOrThrow(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: eventInclude,
    });
    if (!event) throw new NotFoundException('Event not found.');
    return event;
  }

  private async assertSchoolsExist(schoolIds: string[]) {
    const count = await this.prisma.school.count({
      where: { id: { in: schoolIds }, isActive: true },
    });
    if (count !== schoolIds.length) {
      this.fieldError('schoolIds', 'One or more school IDs are invalid.');
    }
  }

  private fieldError(field: string, message: string): never {
    throw new BadRequestException({ message, field });
  }

  private assertZonePairing(
    state?: string | null,
    district?: string | null,
  ) {
    const hasState = Boolean(state?.trim());
    const hasDistrict = Boolean(district?.trim());
    if (hasState !== hasDistrict) {
      this.fieldError(
        'state',
        'Set both state and district for a zone, or leave both empty for nationwide.',
      );
    }
  }

  private assertDateLogic(dto: {
    startsAt: string;
    endsAt?: string | null;
    registrationOpensAt: string;
    registrationClosesAt: string;
  }) {
    const startsAt = new Date(dto.startsAt);
    const opensAt = new Date(dto.registrationOpensAt);
    const closesAt = new Date(dto.registrationClosesAt);

    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(opensAt.getTime()) ||
      Number.isNaN(closesAt.getTime())
    ) {
      this.fieldError('startsAt', 'Invalid date values.');
    }
    if (closesAt < opensAt) {
      this.fieldError(
        'registrationClosesAt',
        'Registration close must be after registration open.',
      );
    }
    if (closesAt > startsAt) {
      this.fieldError(
        'registrationClosesAt',
        'Registration must close on or before the event start.',
      );
    }
    if (dto.endsAt) {
      const endsAt = new Date(dto.endsAt);
      if (Number.isNaN(endsAt.getTime()) || endsAt < startsAt) {
        this.fieldError('endsAt', 'Event end must be after event start.');
      }
    }
  }

  private eventHasZone(event: { state: string | null; district: string | null }) {
    return Boolean(event.state?.trim() && event.district?.trim());
  }

  private throwProfileIncomplete(missing: string[]): never {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      code: 'PROFILE_INCOMPLETE',
      message: 'Complete your profile to register for this event.',
      missing,
    });
  }

  /**
   * Requires gender + DOB always; location when the event has a zone;
   * schoolId when the event targets specific schools.
   */
  private assertRegistrationProfile(user: User, event: EventWithRelations) {
    const missing: string[] = [];
    if (!user.gender) missing.push('gender');
    if (!user.dateOfBirth) missing.push('dateOfBirth');

    if (this.eventHasZone(event)) {
      if (!user.state?.trim()) missing.push('state');
      if (!user.district?.trim()) missing.push('district');
    }

    if (event.schools.length > 0 && !user.schoolId) {
      missing.push('schoolId');
    }

    if (missing.length) {
      this.throwProfileIncomplete(missing);
    }
  }

  /**
   * Returns a user-facing reason when the player cannot join, or null if eligible.
   * Location / age / gender mismatches are advisory only — players may still register.
   * School targeting remains enforced. Missing profile fields are handled by
   * assertRegistrationProfile.
   */
  private getIneligibilityReason(
    user: User,
    event: EventWithRelations,
  ): string | null {
    if (!user.gender || !user.dateOfBirth) {
      return 'Complete your gender and date of birth to register for this event.';
    }

    // Zone / age / gender mismatches are advisory (shown in the app, not blocked here).
    if (this.eventHasZone(event)) {
      if (!user.state?.trim() || !user.district?.trim()) {
        return 'Add your state and district in your profile to register for this event.';
      }
    }

    if (event.schools.length > 0) {
      if (!user.schoolId) {
        return 'This event is limited to selected schools. Link your school in your profile to register.';
      }
      const allowed = event.schools.some((s) => s.schoolId === user.schoolId);
      if (!allowed) {
        const names = event.schools
          .map((s) => s.school?.name)
          .filter(Boolean)
          .join(', ');
        return names
          ? `This event is only open to: ${names}. Your school is not on the list.`
          : 'Your school is not eligible for this event.';
      }
    }

    return null;
  }

  fitsAgeCategory(
    dateOfBirth: Date,
    eventDate: Date,
    category: AgeCategory,
  ): boolean {
    if (category === AgeCategory.OPEN) return true;

    const age = this.ageOnDate(dateOfBirth, eventDate);
    const maxExclusive: Record<Exclude<AgeCategory, 'OPEN'>, number> = {
      U12: 12,
      U14: 14,
      U16: 16,
      U18: 18,
    };
    return age < maxExclusive[category];
  }

  private ageOnDate(dob: Date, on: Date): number {
    let age = on.getFullYear() - dob.getFullYear();
    const m = on.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) {
      age -= 1;
    }
    return age;
  }

  private async isUserRegistered(eventId: string, userId: string) {
    const reg = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        status: RegistrationStatus.CONFIRMED,
      },
    });
    return !!reg;
  }

  private notifyRegistrationConfirmed(
    userId: string,
    event: { id: string; name: string },
  ) {
    this.pushNotifications.sendToUser(userId, {
      type: 'event_registration_confirmed',
      notificationId: `n_${event.id}`,
      eventId: event.id,
      title: 'Registration confirmed',
      body: `You are registered for ${event.name}.`,
    });
  }

  private async requireActiveGame(gameId: string) {
    const game = await this.prisma.game.findFirst({
      where: { id: gameId, isActive: true },
    });
    if (!game) {
      this.fieldError('gameId', 'Invalid or inactive game.');
    }
    return game;
  }

  private normalizeZone(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private assertChessBoardCount(gameName: string | undefined, boardCount?: number | null) {
    if (gameName === 'Chess' && (!boardCount || boardCount < 1)) {
      this.fieldError(
        'boardCount',
        'boardCount is required and must be at least 1 for Chess events.',
      );
    }
  }

  private toGameResponse(
    game: {
      id: string;
      name: string;
      imageUrl: string | null;
      sidesPerMatch: number;
      playersPerSide: number;
      winPoints: number;
      lossPoints: number;
      isActive: boolean;
    } | null,
  ) {
    if (!game) return null;
    return {
      id: game.id,
      name: game.name,
      imageUrl: game.imageUrl,
      sidesPerMatch: game.sidesPerMatch,
      playersPerSide: game.playersPerSide,
      playersPerMatch: game.sidesPerMatch * game.playersPerSide,
      winPoints: game.winPoints,
      lossPoints: game.lossPoints,
      isActive: game.isActive,
    };
  }

  private buildRegistrationPaymentData(fee: number, dto: RegisterEventDto) {
    const amountPaid = fee;
    const isPaid = amountPaid > 0;
    const paymentRef = isPaid
      ? (dto.paymentRef?.trim() ||
          `PAY-${Date.now().toString(36).toUpperCase()}`)
      : dto.paymentRef?.trim() || null;

    return {
      amountPaid,
      paymentRef,
      paidAt: isPaid ? new Date() : null,
      paymentMethod: isPaid
        ? (dto.paymentMethod?.trim().toUpperCase() || 'MOCK')
        : 'FREE',
    };
  }

  private toRegistrationResponse(
    registration: {
      id: string;
      eventId: string;
      userId: string;
      status: RegistrationStatus;
      registeredAt: Date;
      outcome: MatchOutcome | null;
      pointsEarned: number;
      amountPaid: number;
      paymentRef: string | null;
      paidAt: Date | null;
      paymentMethod: string | null;
      eventWins: number;
      eventLosses: number;
      eventDraws: number;
      gamesCompleted: number;
    },
    event: EventWithRelations,
    includeFullEvent = false,
  ) {
    return {
      id: registration.id,
      eventId: registration.eventId,
      userId: registration.userId,
      status: registration.status,
      registeredAt: registration.registeredAt,
      outcome: registration.outcome,
      pointsEarned: registration.pointsEarned,
      amountPaid: registration.amountPaid,
      paymentRef: registration.paymentRef,
      paidAt: registration.paidAt,
      paymentMethod: registration.paymentMethod,
      eventWins: registration.eventWins,
      eventLosses: registration.eventLosses,
      eventDraws: registration.eventDraws,
      gamesCompleted: registration.gamesCompleted,
      event: includeFullEvent
        ? this.toEventResponse(event, true)
        : {
            id: event.id,
            name: event.name,
            startsAt: event.startsAt,
            venue: event.venue,
          },
    };
  }

  private toOrganizerEventResponse(event: EventWithRelations) {
    return {
      id: event.id,
      name: event.name,
      sport: event.sport,
      venue: event.venue,
      state: event.state,
      district: event.district,
      startsAt: event.startsAt,
      status: event.status,
      imageUrl: event.imageUrl,
      attendanceWindowOpen: this.isAttendanceWindowOpen(
        event.startsAt,
        event.status,
      ),
      attendanceOpensAt: new Date(event.startsAt.getTime() - 30 * 60 * 1000),
    };
  }

  private toEventResponse(event: EventWithRelations, isRegistered?: boolean) {
    const registeredCount = event._count.registrations;
    return {
      id: event.id,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      name: event.name,
      sport: event.sport,
      gameId: event.gameId,
      game: this.toGameResponse(event.game),
      description: event.description,
      venue: event.venue,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      registrationOpensAt: event.registrationOpensAt,
      registrationClosesAt: event.registrationClosesAt,
      maxParticipants: event.maxParticipants,
      registeredCount,
      seatsLeft: Math.max(0, event.maxParticipants - registeredCount),
      status: event.status,
      state: event.state,
      district: event.district,
      ageCategory: event.ageCategory,
      genders: event.genders,
      fee: event.fee,
      pointsReward: event.pointsReward,
      lossPoints: event.lossPoints,
      boardCount: event.boardCount,
      gamesPerPlayer: event.gamesPerPlayer,
      matchmakingStatus: event.matchmakingStatus,
      matchmakingStartedAt: event.matchmakingStartedAt,
      imageUrl: event.imageUrl,
      createdBy: event.createdBy,
      schools: event.schools.map((s) => s.school),
      schoolIds: event.schools.map((s) => s.schoolId),
      organizers: event.organizers.map((o) => o.user),
      organizerIds: event.organizers.map((o) => o.userId),
      attendanceWindowOpen: this.isAttendanceWindowOpen(
        event.startsAt,
        event.status,
      ),
      attendanceOpensAt: new Date(event.startsAt.getTime() - 30 * 60 * 1000),
      ...(isRegistered !== undefined ? { isRegistered } : {}),
    };
  }
}
