import {
  EventStatus,
  MatchmakingStatus,
  User,
} from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

export type EventForRegistration = {
  id: string;
  status: EventStatus;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  maxParticipants: number;
  matchmakingStatus: MatchmakingStatus;
  endsAt: Date | null;
  schools: { schoolId: string; school?: { name: string } | null }[];
};

export function isEventPlayFinished(
  event: Pick<EventForRegistration, 'matchmakingStatus' | 'endsAt'>,
  now = new Date(),
): boolean {
  if (
    event.matchmakingStatus === MatchmakingStatus.COMPLETED ||
    event.matchmakingStatus === MatchmakingStatus.IN_PROGRESS
  ) {
    return true;
  }
  if (event.endsAt && event.endsAt < now) {
    return true;
  }
  return false;
}

export function assertPublishedForRegistration(
  status: EventStatus,
): void {
  if (status === EventStatus.PUBLISHED) return;

  if (status === EventStatus.COMPLETED) {
    throw new BadRequestException('This event has already finished.');
  }
  if (status === EventStatus.CANCELLED) {
    throw new BadRequestException('This event has been cancelled.');
  }
  throw new BadRequestException('Event is not open for registration.');
}

export function assertRegistrationWindow(
  event: Pick<EventForRegistration, 'registrationOpensAt' | 'registrationClosesAt'>,
  now = new Date(),
): void {
  if (now < event.registrationOpensAt) {
    throw new BadRequestException('Registration has not opened yet.');
  }
  if (now > event.registrationClosesAt) {
    throw new BadRequestException('Registration deadline has passed.');
  }
}

export function assertPlayNotStarted(
  event: Pick<EventForRegistration, 'matchmakingStatus' | 'endsAt'>,
  now = new Date(),
): void {
  if (event.matchmakingStatus === MatchmakingStatus.IN_PROGRESS) {
    throw new BadRequestException('This event is already in progress.');
  }
  if (event.matchmakingStatus === MatchmakingStatus.COMPLETED) {
    throw new BadRequestException('This event has already finished.');
  }
  if (event.endsAt && now > event.endsAt) {
    throw new BadRequestException('This event has already ended.');
  }
}

export function assertRegistrationCapacity(
  confirmedCount: number,
  maxParticipants: number,
): void {
  if (confirmedCount >= maxParticipants) {
    throw new BadRequestException('Event is full.');
  }
}

export function assertSchoolEligibility(
  user: Pick<User, 'schoolId'>,
  event: Pick<EventForRegistration, 'schools'>,
): void {
  if (event.schools.length === 0) return;

  if (!user.schoolId) {
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'NOT_ELIGIBLE',
      message:
        'This event is limited to selected schools. Link your school in your profile to register.',
    });
  }

  const allowed = event.schools.some((s) => s.schoolId === user.schoolId);
  if (!allowed) {
    const names = event.schools
      .map((s) => s.school?.name)
      .filter(Boolean)
      .join(', ');
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: 'NOT_ELIGIBLE',
      message: names
        ? `This event is only open to: ${names}. Your school is not on the list.`
        : 'Your school is not eligible for this event.',
    });
  }
}

export function assertPlayerCanRegister(
  user: User,
  event: EventForRegistration,
  confirmedCount: number,
  now = new Date(),
): void {
  assertPublishedForRegistration(event.status);
  assertRegistrationWindow(event, now);
  assertPlayNotStarted(event, now);
  assertSchoolEligibility(user, event);
  assertRegistrationCapacity(confirmedCount, event.maxParticipants);
}

export function sortBrowseEvents<T extends {
  registrationClosesAt: Date;
  startsAt: Date;
}>(
  events: T[],
  now = new Date(),
): T[] {
  return [...events].sort((a, b) => {
    const aClosed = a.registrationClosesAt < now;
    const bClosed = b.registrationClosesAt < now;
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    return a.startsAt.getTime() - b.startsAt.getTime();
  });
}

export const browseablePublishedWhere = (now = new Date()) => ({
  status: EventStatus.PUBLISHED,
  matchmakingStatus: {
    notIn: [MatchmakingStatus.COMPLETED, MatchmakingStatus.IN_PROGRESS],
  },
  OR: [{ endsAt: null }, { endsAt: { gte: now } }],
});
