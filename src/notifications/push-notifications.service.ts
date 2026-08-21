import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { DeviceTokensService } from './device-tokens.service';
import { parseServiceAccountJson } from './parse-service-account-json';
import {
  DEFAULT_FCM_BATCH_SIZE,
  DEFAULT_FCM_RETRY_DELAY_MS,
  MulticastPayload,
  sendTokensWithRetry,
} from './push-batch.util';
import {
  buildWelcomePushPayload,
  isWithinWelcomeWindow,
} from './welcome-push.util';

export type PushNotificationPayload = {
  title: string;
  body: string;
  type: string;
  notificationId?: string;
  eventId?: string;
};

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);
  private messaging: Messaging | null = null;
  private readonly batchSize: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly deviceTokens: DeviceTokensService,
  ) {
    this.batchSize = Number(
      this.config.get<string>('FCM_BATCH_SIZE') ?? DEFAULT_FCM_BATCH_SIZE,
    );
    this.retryDelayMs = Number(
      this.config.get<string>('FCM_RETRY_DELAY_MS') ?? DEFAULT_FCM_RETRY_DELAY_MS,
    );
  }

  onModuleInit() {
    this.ensureMessaging();
  }

  private ensureMessaging(): Messaging | null {
    if (this.messaging) return this.messaging;

    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!raw?.trim()) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_JSON is not set — push notifications are disabled.',
      );
      return null;
    }

    try {
      const credentials = parseServiceAccountJson(raw) as ServiceAccount;
      if (!getApps().length) {
        initializeApp({
          credential: cert(credentials),
        });
      }
      this.messaging = getMessaging();
      return this.messaging;
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
      return null;
    }
  }

  private toMulticastPayload(payload: PushNotificationPayload): MulticastPayload {
    const data: Record<string, string> = {
      type: payload.type,
      title: payload.title,
      body: payload.body,
    };
    if (payload.notificationId) data.notificationId = payload.notificationId;
    if (payload.eventId) data.eventId = payload.eventId;

    return {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    };
  }

  sendToUser(userId: string, payload: PushNotificationPayload) {
    void this.sendToUserAsync(userId, payload);
  }

  sendWelcomeIfNewProfile(user: {
    id: string;
    firstName: string;
    lastName: string;
    createdAt: Date;
  }) {
    if (!isWithinWelcomeWindow(user.createdAt)) return;
    this.sendToUser(user.id, buildWelcomePushPayload(user));
  }

  sendToUsers(userIds: string[], payload: PushNotificationPayload) {
    void this.sendToUsersAsync(userIds, payload);
  }

  async sendToUserAsync(userId: string, payload: PushNotificationPayload) {
    const tokens = await this.deviceTokens.tokensForUser(userId);
    return this.sendToTokensAsync(tokens, payload);
  }

  async sendToUsersAsync(userIds: string[], payload: PushNotificationPayload) {
    const tokens = await this.deviceTokens.tokensForUsers(userIds);
    return this.sendToTokensAsync(tokens, payload);
  }

  async sendToTokensAsync(
    tokens: string[],
    payload: PushNotificationPayload,
  ) {
    const messaging = this.ensureMessaging();
    if (!messaging) {
      return {
        total: tokens.length,
        success: 0,
        failedPermanent: 0,
        abandonedAfterRetry: 0,
        permanentFailures: [],
        abandonedFailures: [],
      };
    }

    const summary = await sendTokensWithRetry(
      messaging,
      tokens,
      this.toMulticastPayload(payload),
      {
        batchSize: this.batchSize,
        retryDelayMs: this.retryDelayMs,
      },
    );

    if (summary.permanentFailures.length > 0) {
      await this.deviceTokens.deleteTokens(
        summary.permanentFailures.map((failure) => failure.token),
      );
    }

    if (summary.total > 0) {
      this.logger.log(
        `FCM send complete: total=${summary.total} success=${summary.success} permanent=${summary.failedPermanent} abandoned=${summary.abandonedAfterRetry}`,
      );
    }

    if (summary.abandonedAfterRetry > 0) {
      this.logger.warn(
        `Abandoned ${summary.abandonedAfterRetry} FCM token(s) after retry`,
      );
    }

    return summary;
  }
}
