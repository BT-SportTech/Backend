import { Injectable } from '@nestjs/common';
import {
  AgeCategory,
  Gender,
  Prisma,
  RegistrationStatus,
  User,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const eventEligibilityInclude = {
  schools: {
    include: {
      school: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.EventInclude;

export type EventForEligibility = Prisma.EventGetPayload<{
  include: typeof eventEligibilityInclude;
}>;

@Injectable()
export class EventEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  eventHasZone(event: { state: string | null; district: string | null }) {
    return Boolean(event.state?.trim() && event.district?.trim());
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

  isPlayerEligibleForEvent(user: User, event: EventForEligibility): boolean {
    if (user.role !== UserRole.PLAYER) return false;
    if (!user.gender || !user.dateOfBirth) return false;

    if (this.eventHasZone(event)) {
      if (!user.state?.trim() || !user.district?.trim()) return false;
      if (
        user.state.trim().toLowerCase() !== event.state!.trim().toLowerCase() ||
        user.district.trim().toLowerCase() !==
          event.district!.trim().toLowerCase()
      ) {
        return false;
      }
    }

    if (event.schools.length > 0) {
      if (!user.schoolId) return false;
      const allowed = event.schools.some((s) => s.schoolId === user.schoolId);
      if (!allowed) return false;
    }

    if (event.genders.length > 0 && !event.genders.includes(user.gender)) {
      return false;
    }

    if (
      !this.fitsAgeCategory(user.dateOfBirth, event.startsAt, event.ageCategory)
    ) {
      return false;
    }

    return true;
  }

  isRegistrationProfileIncomplete(
    user: User,
    event: EventForEligibility,
  ): boolean {
    if (!user.gender || !user.dateOfBirth) return true;

    if (this.eventHasZone(event)) {
      if (!user.state?.trim() || !user.district?.trim()) return true;
    }

    if (event.schools.length > 0 && !user.schoolId) return true;

    return false;
  }

  /**
   * Publish notifications go to fully eligible players and to players whose
   * registration profile is incomplete so they can finish it and register.
   */
  shouldNotifyPlayerOfNewEvent(
    user: User,
    event: EventForEligibility,
  ): boolean {
    if (user.role !== UserRole.PLAYER) return false;
    if (this.isRegistrationProfileIncomplete(user, event)) return true;
    return this.isPlayerEligibleForEvent(user, event);
  }

  async findEligiblePlayerIds(event: EventForEligibility): Promise<string[]> {
    const pageSize = 200;
    const eligible: string[] = [];
    let skip = 0;

    while (true) {
      const players = await this.prisma.user.findMany({
        where: { role: UserRole.PLAYER },
        skip,
        take: pageSize,
        orderBy: { id: 'asc' },
      });
      if (players.length === 0) break;

      for (const player of players) {
        if (this.shouldNotifyPlayerOfNewEvent(player, event)) {
          eligible.push(player.id);
        }
      }

      if (players.length < pageSize) break;
      skip += pageSize;
    }

    if (eligible.length === 0) return [];

    const withTokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: eligible } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const tokenUserIds = new Set(withTokens.map((row) => row.userId));
    return eligible.filter((id) => tokenUserIds.has(id));
  }

  async findRegisteredUserIds(eventId: string): Promise<string[]> {
    const rows = await this.prisma.eventRegistration.findMany({
      where: { eventId, status: RegistrationStatus.CONFIRMED },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  private ageOnDate(dob: Date, on: Date): number {
    let age = on.getFullYear() - dob.getFullYear();
    const m = on.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) {
      age -= 1;
    }
    return age;
  }
}
