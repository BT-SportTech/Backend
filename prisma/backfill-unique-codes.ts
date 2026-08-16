/**
 * Backfill existing PLAYER / PROFESSIONAL users with unique 8-char alphanumeric codes.
 * Skips ADMIN and ORGANIZER accounts, and anyone who already has a valid code.
 *
 * Dry run (no writes):
 *   npx tsx -r dotenv/config prisma/backfill-unique-codes.ts --dry-run
 *
 * Apply updates:
 *   npx tsx -r dotenv/config prisma/backfill-unique-codes.ts
 *
 * Or: npm run prisma:backfill-unique-codes
 */
import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  generateUniqueCodeCandidate,
  isValidUniqueCode,
  UNIQUE_CODE_LENGTH,
} from '../src/common/unique-code';

const MAX_ALLOCATE_ATTEMPTS = 48;
const BACKFILL_ROLES: UserRole[] = [UserRole.PLAYER, UserRole.PROFESSIONAL];

async function allocateUniqueCode(
  prisma: PrismaClient,
  reserved: Set<string>,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ALLOCATE_ATTEMPTS; attempt++) {
    const candidate = generateUniqueCodeCandidate(UNIQUE_CODE_LENGTH);
    if (reserved.has(candidate)) continue;
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new Error('Could not allocate a unique 8-character code after retries.');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const users = await prisma.user.findMany({
      where: { role: { in: BACKFILL_ROLES } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        role: true,
        email: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const needsUpdate = users.filter((u) => !isValidUniqueCode(u.username));
    const alreadyValid = users.length - needsUpdate.length;

    console.log(
      dryRun
        ? 'Dry run — no usernames will be changed.\n'
        : 'Applying unique-code backfill…\n',
    );
    console.log(`Players/professionals scanned: ${users.length}`);
    console.log(`Already valid 8-char codes:    ${alreadyValid}`);
    console.log(`To update:                     ${needsUpdate.length}\n`);

    if (needsUpdate.length === 0) {
      console.log('Nothing to update.');
      return;
    }

    const reserved = new Set(
      users.filter((u) => isValidUniqueCode(u.username)).map((u) => u.username),
    );

    const rows: Array<{
      id: string;
      name: string;
      role: UserRole;
      oldCode: string;
      newCode: string;
    }> = [];

    for (const user of needsUpdate) {
      const newCode = await allocateUniqueCode(prisma, reserved);
      rows.push({
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        role: user.role,
        oldCode: user.username,
        newCode,
      });
    }

    if (!dryRun) {
      await prisma.$transaction(
        rows.map((row) =>
          prisma.user.update({
            where: { id: row.id },
            data: { username: row.newCode },
          }),
        ),
      );
    }

    console.log('id | name | role | old_code -> new_code');
    console.log('-'.repeat(72));
    for (const row of rows) {
    console.log(
      `${row.id} | ${row.name} | ${row.role} | ${row.oldCode} -> ${row.newCode.toUpperCase()}`,
    );
    }

    console.log(
      `\nDone. ${dryRun ? 'Would update' : 'Updated'} ${rows.length} user(s).`,
    );
    if (!dryRun) {
      console.log(
        'Share the new codes with players — old usernames will no longer work for login.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
