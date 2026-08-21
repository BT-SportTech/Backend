import {
  AgeCategory,
  Gender,
  ScheduledPushStatus,
  ScheduledPushType,
  UserRole,
} from '@prisma/client';
import { EventEligibilityService } from './event-eligibility.service';
import { EventPushSchedulerService } from './event-push-scheduler.service';
import { ScheduledPushProcessor } from './scheduled-push.processor';

describe('EventEligibilityService', () => {
  const service = new EventEligibilityService({} as never);

  const baseEvent = {
    id: 'event1',
    startsAt: new Date('2026-12-01T10:00:00Z'),
    state: 'Karnataka',
    district: 'Bengaluru',
    ageCategory: AgeCategory.OPEN,
    genders: [] as Gender[],
    schools: [],
  };

  const basePlayer = {
    id: 'player1',
    role: UserRole.PLAYER,
    gender: Gender.MALE,
    dateOfBirth: new Date('2000-01-01'),
    state: 'Karnataka',
    district: 'Bengaluru',
    schoolId: null,
  };

  it('accepts player in matching zone', () => {
    expect(service.isPlayerEligibleForEvent(basePlayer as never, baseEvent)).toBe(
      true,
    );
  });

  it('rejects player outside zone', () => {
    expect(
      service.isPlayerEligibleForEvent(
        { ...basePlayer, district: 'Mysuru' } as never,
        baseEvent,
      ),
    ).toBe(false);
  });

  it('rejects player with gender mismatch', () => {
    expect(
      service.isPlayerEligibleForEvent(basePlayer as never, {
        ...baseEvent,
        genders: [Gender.FEMALE],
      }),
    ).toBe(false);
  });

  it('notifies players with incomplete registration profile', () => {
    expect(
      service.shouldNotifyPlayerOfNewEvent(
        {
          ...basePlayer,
          gender: null,
          dateOfBirth: null,
        } as never,
        baseEvent,
      ),
    ).toBe(true);
  });

  it('notifies complete-profile players only when fully eligible', () => {
    expect(
      service.shouldNotifyPlayerOfNewEvent(
        { ...basePlayer, district: 'Mysuru' } as never,
        baseEvent,
      ),
    ).toBe(false);
  });
});

describe('EventPushSchedulerService helpers', () => {
  it('builds reminder payloads', () => {
    const scheduler = new EventPushSchedulerService(
      {} as never,
      {} as never,
      {} as never,
    );
    const event = { id: 'e1', name: 'Chess Open' };

    expect(
      scheduler.buildReminderPayload(ScheduledPushType.EVENT_START_1H, event),
    ).toMatchObject({
      type: 'event_start_1h',
      body: 'Chess Open starts in 1 hour.',
    });
    expect(
      scheduler.buildReminderPayload(
        ScheduledPushType.EVENT_ATTENDANCE_OPEN,
        event,
      ),
    ).toMatchObject({
      type: 'event_attendance_open',
      body: 'Chess Open: attendance is open now.',
    });
  });
});

describe('ScheduledPushProcessor', () => {
  it('skips cancelled events', async () => {
    const update = jest.fn();
    const prisma = {
      scheduledPush: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sp1',
            userId: 'u1',
            type: ScheduledPushType.EVENT_START_1H,
            event: { id: 'e1', name: 'Event', status: 'CANCELLED' },
          },
        ]),
        update,
      },
    };
    const processor = new ScheduledPushProcessor(
      prisma as never,
      {} as never,
      {
        buildReminderPayload: jest.fn(),
      } as never,
      { get: () => '500' } as never,
    );

    await processor.processDuePushes();

    expect(update).toHaveBeenCalledWith({
      where: { id: 'sp1' },
      data: { status: ScheduledPushStatus.SKIPPED },
    });
  });
});
