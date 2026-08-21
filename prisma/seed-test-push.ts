/**
 * Send a test push notification to a user by phone number.
 *
 * Usage:
 *   npx tsx -r dotenv/config prisma/seed-test-push.ts
 *   npx tsx -r dotenv/config prisma/seed-test-push.ts 6281419693
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON in .env and at least one registered device token.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { parseServiceAccountJson } from '../src/notifications/parse-service-account-json';
import { sendTokensWithRetry } from '../src/notifications/push-batch.util';

const DEFAULT_PHONE = '916281419693';

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.startsWith('0') && digits.length === 11) {
    digits = `91${digits.slice(1)}`;
  }
  if (!/^91\d{10}$/.test(digits)) {
    throw new Error(`Invalid phone number: ${phone}`);
  }
  return digits;
}

function initMessaging() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON is not set — cannot send push notifications.',
    );
  }

  const credentials = parseServiceAccountJson(raw) as ServiceAccount;
  if (!getApps().length) {
    initializeApp({ credential: cert(credentials) });
  }
  return getMessaging();
}

async function main() {
  const phoneArg = process.argv[2] ?? DEFAULT_PHONE;
  const normalizedPhone = normalizePhone(phoneArg);

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      where: { phone: normalizedPhone },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        phone: true,
        deviceTokens: { select: { token: true, platform: true } },
      },
    });

    if (users.length === 0) {
      console.error(`No user found for phone ${phoneArg} (stored as ${normalizedPhone}).`);
      process.exit(1);
    }

    console.log(`Found ${users.length} profile(s) for ${normalizedPhone}:`);
    for (const user of users) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
      console.log(`  - ${name} (${user.id}) — ${user.deviceTokens.length} device token(s)`);
    }

    const tokens = [
      ...new Set(users.flatMap((user) => user.deviceTokens.map((row) => row.token))),
    ];

    if (tokens.length === 0) {
      console.error(
        '\nNo device tokens registered for this phone number.',
        '\nOpen the mobile app, sign in with this profile, and allow notifications first.',
      );
      process.exit(1);
    }

    const messaging = initMessaging();
    const primary = users[0]!;
    const displayName =
      [primary.firstName, primary.lastName].filter(Boolean).join(' ') || 'there';

    const payload = {
      notification: {
        title: 'SportTech test notification',
        body: `Hi ${displayName}, push notifications are working!`,
      },
      data: {
        type: 'test',
        title: 'SportTech test notification',
        body: `Hi ${displayName}, push notifications are working!`,
        notificationId: `n_test_${Date.now()}`,
      },
      android: { priority: 'high' as const },
      apns: { payload: { aps: { sound: 'default' } } },
    };

    console.log(`\nSending test push to ${tokens.length} device token(s)...`);
    const summary = await sendTokensWithRetry(messaging, tokens, payload, {
      batchSize: Number(process.env.FCM_BATCH_SIZE ?? 200),
      retryDelayMs: Number(process.env.FCM_RETRY_DELAY_MS ?? 500),
    });

    console.log('\nResult:');
    console.log(`  total:     ${summary.total}`);
    console.log(`  success:   ${summary.success}`);
    console.log(`  permanent: ${summary.failedPermanent}`);
    console.log(`  abandoned: ${summary.abandonedAfterRetry}`);

    if (summary.permanentFailures.length > 0) {
      console.log('\nPermanent failures:');
      for (const failure of summary.permanentFailures) {
        console.log(`  - ${failure.code}: ${failure.message}`);
      }
    }

    if (summary.success === 0) {
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
