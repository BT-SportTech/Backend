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
  Prisma,
  RegistrationStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { EventQueryDto } from './dto/event-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';

const eventInclude = {
  schools: {
    include: {
      school: { select: { id: true, name: true, code: true } },
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
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateEventDto, adminId: string) {
    this.assertDateLogic(dto);

    if (dto.schoolIds?.length) {
      await this.assertSchoolsExist(dto.schoolIds);
    }

    const game = await this.requireActiveGame(dto.gameId);
    const { schoolIds, genders, fee, pointsReward, gameId, state, district, ...rest } =
      dto;

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
          pointsReward: pointsReward ?? game.winPoints,
          status: EventStatus.DRAFT,
          createdById: adminId,
          gameId: game.id,
          sport: game.name,
          state: this.normalizeZone(state),
          district: this.normalizeZone(district),
          schools: schoolIds?.length
            ? { create: schoolIds.map((schoolId) => ({ schoolId })) }
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

    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students and admins can view events.');
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new ForbiddenException('Event is not available.');
    }

    const school = await this.loadStudentSchool(user);
    if (!this.isEligible(user, school, event)) {
      throw new ForbiddenException('You are not eligible for this event.');
    }

    const isRegistered = await this.isUserRegistered(event.id, user.id);
    return this.toEventResponse(event, isRegistered);
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

    if (dto.schoolIds?.length) {
      await this.assertSchoolsExist(dto.schoolIds);
    }

    let gameSport: string | undefined;
    let gameWinPoints: number | undefined;
    if (dto.gameId) {
      const game = await this.requireActiveGame(dto.gameId);
      gameSport = game.name;
      gameWinPoints = game.winPoints;
    }

    const { schoolIds, ...rest } = dto;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (schoolIds !== undefined) {
        await tx.eventSchool.deleteMany({ where: { eventId: id } });
        if (schoolIds.length) {
          await tx.eventSchool.createMany({
            data: schoolIds.map((schoolId) => ({ eventId: id, schoolId })),
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
          ...(rest.pointsReward !== undefined
            ? { pointsReward: rest.pointsReward }
            : gameWinPoints !== undefined
              ? { pointsReward: gameWinPoints }
              : {}),
          ...(rest.imageUrl !== undefined ? { imageUrl: rest.imageUrl } : {}),
        },
        include: eventInclude,
      });
    });

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

    const updated = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PUBLISHED },
      include: eventInclude,
    });
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
    return this.toEventResponse(updated);
  }

  async findEligible(user: User, query: EventQueryDto) {
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can list eligible events.');
    }

    const school = this.requireStudentSchool(
      user,
      await this.loadStudentSchool(user),
    );

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {
      status: EventStatus.PUBLISHED,
      OR: [
        {
          AND: [{ state: null }, { district: null }],
        },
        ...(school.state && school.district
          ? [
              {
                AND: [
                  { state: { equals: school.state, mode: 'insensitive' as const } },
                  {
                    district: {
                      equals: school.district,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
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

    const candidates = await this.prisma.event.findMany({
      where,
      include: eventInclude,
      orderBy: { startsAt: 'asc' },
    });

    const eligible = candidates.filter((e) => this.isEligible(user, school, e));

    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        userId: user.id,
        status: RegistrationStatus.CONFIRMED,
        eventId: { in: eligible.map((e) => e.id) },
      },
      select: { eventId: true },
    });
    const registeredIds = new Set(registrations.map((r) => r.eventId));

    const total = eligible.length;
    const pageRows = eligible.slice(skip, skip + limit);

    return {
      data: pageRows.map((e) =>
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

  async register(eventId: string, user: User) {
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can register for events.');
    }

    const school = this.requireStudentSchool(
      user,
      await this.loadStudentSchool(user),
    );

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventInclude,
    });
    if (!event) throw new NotFoundException('Event not found.');

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException('Event is not open for registration.');
    }

    if (!this.isEligible(user, school, event)) {
      throw new ForbiddenException('You are not eligible for this event.');
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
        },
        include: {
          event: { select: { id: true, name: true, startsAt: true, venue: true } },
        },
      });
      return revived;
    }

    try {
      return await this.prisma.eventRegistration.create({
        data: {
          eventId,
          userId: user.id,
          status: RegistrationStatus.CONFIRMED,
        },
        include: {
          event: { select: { id: true, name: true, startsAt: true, venue: true } },
        },
      });
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
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can view their registrations.');
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
      data: data.map((r) => ({
        id: r.id,
        status: r.status,
        registeredAt: r.registeredAt,
        event: this.toEventResponse(r.event, true),
      })),
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
      throw new BadRequestException('One or more school IDs are invalid.');
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

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) {
      throw new BadRequestException('Invalid date values.');
    }
    if (closesAt < opensAt) {
      throw new BadRequestException(
        'Registration close must be after registration open.',
      );
    }
    if (closesAt > startsAt) {
      throw new BadRequestException(
        'Registration must close on or before the event start.',
      );
    }
    if (dto.endsAt) {
      const endsAt = new Date(dto.endsAt);
      if (Number.isNaN(endsAt.getTime()) || endsAt < startsAt) {
        throw new BadRequestException('Event end must be after event start.');
      }
    }
  }

  private async loadStudentSchool(user: User) {
    if (!user.schoolId) return null;
    return this.prisma.school.findFirst({
      where: { id: user.schoolId, isActive: true },
    });
  }

  private requireStudentSchool(
    user: User,
    school: {
      id: string;
      state: string | null;
      district: string | null;
    } | null,
  ): { id: string; state: string; district: string } {
    if (!user.schoolId || !school) {
      throw new BadRequestException('Student must be linked to an active school.');
    }
    if (!user.gender) {
      throw new BadRequestException('Student gender is required for eligibility.');
    }
    if (!user.dateOfBirth) {
      throw new BadRequestException(
        'Student date of birth is required for eligibility.',
      );
    }
    if (!school.state?.trim() || !school.district?.trim()) {
      throw new BadRequestException(
        'Student school must have state and district set.',
      );
    }
    return {
      id: school.id,
      state: school.state,
      district: school.district,
    };
  }

  private isEligible(
    user: User,
    school: {
      id: string;
      state: string | null;
      district: string | null;
    } | null,
    event: EventWithRelations,
  ): boolean {
    if (!school || !user.gender || !user.dateOfBirth) return false;

    const eventHasZone = Boolean(event.state?.trim() && event.district?.trim());
    if (eventHasZone) {
      if (
        school.state?.toLowerCase() !== event.state!.toLowerCase() ||
        school.district?.toLowerCase() !== event.district!.toLowerCase()
      ) {
        return false;
      }
    }

    if (event.genders.length > 0 && !event.genders.includes(user.gender)) {
      return false;
    }

    if (!this.fitsAgeCategory(user.dateOfBirth, event.startsAt, event.ageCategory)) {
      return false;
    }

    if (event.schools.length > 0) {
      const allowed = event.schools.some((s) => s.schoolId === school.id);
      if (!allowed) return false;
    }

    return true;
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

  private async requireActiveGame(gameId: string) {
    const game = await this.prisma.game.findFirst({
      where: { id: gameId, isActive: true },
    });
    if (!game) {
      throw new BadRequestException('Invalid or inactive game.');
    }
    return game;
  }

  private normalizeZone(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
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
      imageUrl: event.imageUrl,
      createdBy: event.createdBy,
      schools: event.schools.map((s) => s.school),
      schoolIds: event.schools.map((s) => s.schoolId),
      ...(isRegistered !== undefined ? { isRegistered } : {}),
    };
  }
}
