import { Injectable, Logger } from '@nestjs/common';
import { ScheduledPushStatus, ScheduledPushType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EventEligibilityService,
  EventForEligibility,
  eventEligibilityInclude,
} from './event-eligibility.service';
import { PushNotificationsService } from './push-notifications.service';

const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

@Injectable()
export class EventPushSchedulerService {
  private readonly logger = new Logger(EventPushSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eligibility: EventEligibilityService,
    private readonly pushNotifications: PushNotificationsService,
  ) {}

  notifyEligiblePlayersOnPublish(event: EventForEligibility) {
    void this.notifyEligiblePlayersOnPublishAsync(event);
  }

  scheduleRegistrationReminders(
    event: { id: string; name: string; startsAt: Date },
    userId: string,
  ) {
    void this.scheduleRegistrationRemindersAsync(event, userId);
  }

  rescheduleEventReminders(eventId: string) {
    void this.rescheduleEventRemindersAsync(eventId);
  }

  cancelEventReminders(eventId: string) {
    void this.cancelEventRemindersAsync(eventId);
  }

  private async notifyEligiblePlayersOnPublishAsync(event: EventForEligibility) {
    try {
      const [eligibleIds, registeredIds] = await Promise.all([
        this.eligibility.findEligiblePlayerIds(event),
        this.eligibility.findRegisteredUserIds(event.id),
      ]);
      const registered = new Set(registeredIds);
      const targetIds = eligibleIds.filter((id) => !registered.has(id));
      if (targetIds.length === 0) return;

      const place = [event.district, event.state]
        .filter((value) => value?.trim())
        .join(', ');
      const body = place
        ? `${event.name} is open for registration in ${place}.`
        : `${event.name} is open for registration.`;

      await this.pushNotifications.sendToUsersAsync(targetIds, {
        type: 'event_published',
        notificationId: `n_${event.id}_published`,
        eventId: event.id,
        title: 'New event near you',
        body,
      });
    } catch (error) {
      this.logger.error(
        `Failed to notify eligible players for event ${event.id}`,
        error,
      );
    }
  }

  private async scheduleRegistrationRemindersAsync(
    event: { id: string; name: string; startsAt: Date },
    userId: string,
  ) {
    const now = Date.now();
    const startsAtMs = event.startsAt.getTime();

    const reminders: Array<{
      type: ScheduledPushType;
      sendAt: Date;
    }> = [
      {
        type: ScheduledPushType.EVENT_START_1H,
        sendAt: new Date(startsAtMs - ONE_HOUR_MS),
      },
      {
        type: ScheduledPushType.EVENT_ATTENDANCE_OPEN,
        sendAt: new Date(startsAtMs - THIRTY_MINUTES_MS),
      },
    ];

    for (const reminder of reminders) {
      if (reminder.sendAt.getTime() <= now) continue;

      await this.prisma.scheduledPush.upsert({
        where: {
          userId_eventId_type: {
            userId,
            eventId: event.id,
            type: reminder.type,
          },
        },
        create: {
          userId,
          eventId: event.id,
          type: reminder.type,
          sendAt: reminder.sendAt,
          status: ScheduledPushStatus.PENDING,
        },
        update: {
          sendAt: reminder.sendAt,
          status: ScheduledPushStatus.PENDING,
          sentAt: null,
        },
      });
    }
  }

  private async rescheduleEventRemindersAsync(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, startsAt: true },
    });
    if (!event) return;

    const registrations = await this.prisma.eventRegistration.findMany({
      where: { eventId, status: 'CONFIRMED' },
      select: { userId: true },
    });

    for (const registration of registrations) {
      await this.scheduleRegistrationRemindersAsync(event, registration.userId);
    }
  }

  private async cancelEventRemindersAsync(eventId: string) {
    await this.prisma.scheduledPush.updateMany({
      where: { eventId, status: ScheduledPushStatus.PENDING },
      data: { status: ScheduledPushStatus.SKIPPED },
    });
  }

  async loadEventForEligibility(
    eventId: string,
  ): Promise<EventForEligibility | null> {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      include: eventEligibilityInclude,
    });
  }

  buildReminderPayload(
    type: ScheduledPushType,
    event: { id: string; name: string },
  ) {
    if (type === ScheduledPushType.EVENT_START_1H) {
      return {
        type: 'event_start_1h',
        notificationId: `n_${event.id}_start_1h`,
        eventId: event.id,
        title: 'Event starting soon',
        body: `${event.name} starts in 1 hour.`,
      };
    }

    return {
      type: 'event_attendance_open',
      notificationId: `n_${event.id}_attendance`,
      eventId: event.id,
      title: 'Attendance open',
      body: `${event.name}: attendance is open now.`,
    };
  }
}
