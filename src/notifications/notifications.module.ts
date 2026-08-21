import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DeviceTokensController } from './device-tokens.controller';
import { DeviceTokensService } from './device-tokens.service';
import { EventEligibilityService } from './event-eligibility.service';
import { EventPushSchedulerService } from './event-push-scheduler.service';
import { InternalCronController } from './internal-cron.controller';
import { PushNotificationsService } from './push-notifications.service';
import { ScheduledPushProcessor } from './scheduled-push.processor';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [DeviceTokensController, InternalCronController],
  providers: [
    DeviceTokensService,
    PushNotificationsService,
    EventEligibilityService,
    EventPushSchedulerService,
    ScheduledPushProcessor,
  ],
  exports: [
    DeviceTokensService,
    PushNotificationsService,
    EventPushSchedulerService,
  ],
})
export class NotificationsModule {}
