import {
  EventStatus,
  MatchmakingStatus,
  UserRole,
} from '@prisma/client';
import {
  assertPlayerCanRegister,
  assertRegistrationCapacity,
  assertRegistrationWindow,
  isEventPlayFinished,
  sortBrowseEvents,
} from './event-registration.guard';

const baseEvent = {
  id: 'event1',
  status: EventStatus.PUBLISHED,
  registrationOpensAt: new Date('2026-01-01T00:00:00Z'),
  registrationClosesAt: new Date('2026-12-01T00:00:00Z'),
  maxParticipants: 10,
  matchmakingStatus: MatchmakingStatus.NOT_STARTED,
  endsAt: new Date('2026-12-02T00:00:00Z'),
  schools: [],
};

const baseUser = {
  id: 'user1',
  role: UserRole.PLAYER,
  schoolId: null,
} as const;

describe('event-registration.guard', () => {
  const midWindow = new Date('2026-06-01T12:00:00Z');

  it('detects finished play via matchmaking or endsAt', () => {
    expect(
      isEventPlayFinished(
        {
          matchmakingStatus: MatchmakingStatus.COMPLETED,
          endsAt: null,
        },
        midWindow,
      ),
    ).toBe(true);
    expect(
      isEventPlayFinished(
        {
          matchmakingStatus: MatchmakingStatus.IN_PROGRESS,
          endsAt: null,
        },
        midWindow,
      ),
    ).toBe(true);
    expect(
      isEventPlayFinished(
        {
          matchmakingStatus: MatchmakingStatus.NOT_STARTED,
          endsAt: new Date('2026-01-01T00:00:00Z'),
        },
        midWindow,
      ),
    ).toBe(true);
    expect(
      isEventPlayFinished(baseEvent, midWindow),
    ).toBe(false);
  });

  it('rejects registration outside the window', () => {
    expect(() =>
      assertRegistrationWindow(baseEvent, new Date('2025-12-01T00:00:00Z')),
    ).toThrow('Registration has not opened yet');
    expect(() =>
      assertRegistrationWindow(baseEvent, new Date('2027-01-01T00:00:00Z')),
    ).toThrow('Registration deadline has passed');
  });

  it('rejects when event is full', () => {
    expect(() => assertRegistrationCapacity(10, 10)).toThrow('Event is full');
  });

  it('allows registration when all gates pass', () => {
    expect(() =>
      assertPlayerCanRegister(baseUser as never, baseEvent, 3, midWindow),
    ).not.toThrow();
  });

  it('rejects completed event registration', () => {
    expect(() =>
      assertPlayerCanRegister(
        baseUser as never,
        { ...baseEvent, status: EventStatus.COMPLETED },
        3,
        midWindow,
      ),
    ).toThrow('already finished');
  });

  it('rejects when matchmaking started', () => {
    expect(() =>
      assertPlayerCanRegister(
        baseUser as never,
        {
          ...baseEvent,
          matchmakingStatus: MatchmakingStatus.IN_PROGRESS,
        },
        3,
        midWindow,
      ),
    ).toThrow('already in progress');
  });

  it('sorts registration-closed events last', () => {
    const open = {
      registrationClosesAt: new Date('2026-12-01T00:00:00Z'),
      startsAt: new Date('2026-08-01T00:00:00Z'),
    };
    const closed = {
      registrationClosesAt: new Date('2026-05-01T00:00:00Z'),
      startsAt: new Date('2026-07-01T00:00:00Z'),
    };
    const sorted = sortBrowseEvents([closed, open], midWindow);
    expect(sorted[0]).toBe(open);
    expect(sorted[1]).toBe(closed);
  });
});
