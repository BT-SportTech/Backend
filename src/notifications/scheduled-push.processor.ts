import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledPushStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventPushSchedulerService } from './event-push-scheduler.service';
import { PushNotificationsService } from './push-notifications.service';

@Injectable()
export class ScheduledPushProcessor {
  private readonly logger = new Logger(ScheduledPushProcessor.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushNotifications: PushNotificationsService,
    private readonly scheduler: EventPushSchedulerService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    await this.processDuePushes();
  }

  async processDuePushes() {
    if (this.processing) return;
    this.processing = true;

    try {
      const batchSize = Number(
        this.config.get<string>('SCHEDULED_PUSH_BATCH_SIZE') ?? 500,
      );
      const due = await this.prisma.scheduledPush.findMany({
        where: {
          status: ScheduledPushStatus.PENDING,
          sendAt: { lte: new Date() },
        },
        include: {
          event: { select: { id: true, name: true, status: true } },
        },
        orderBy: { sendAt: 'asc' },
        take: batchSize,
      });

      for (const row of due) {
        if (row.event.status === 'CANCELLED') {
          await this.prisma.scheduledPush.update({
            where: { id: row.id },
            data: { status: ScheduledPushStatus.SKIPPED },
          });
          continue;
        }

        const payload = this.scheduler.buildReminderPayload(row.type, row.event);
        try {
          const summary = await this.pushNotifications.sendToUserAsync(
            row.userId,
            payload,
          );
          const delivered = summary.success > 0;
          await this.prisma.scheduledPush.update({
            where: { id: row.id },
            data: {
              status: delivered
                ? ScheduledPushStatus.SENT
                : ScheduledPushStatus.FAILED,
              sentAt: delivered ? new Date() : null,
            },
          });
        } catch (error) {
          this.logger.error(`Failed scheduled push ${row.id}`, error);
          await this.prisma.scheduledPush.update({
            where: { id: row.id },
            data: { status: ScheduledPushStatus.FAILED },
          });
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
