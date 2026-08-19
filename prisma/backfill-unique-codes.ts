/**
 * Backfill non-numeric player usernames to 8-digit numeric unique codes
 * using player_unique_code_seq. Run after applying the sequence migration.
 *
 * Usage: npm run prisma:backfill-unique-codes
 */
import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isValidUniqueCode } from '../src/common/unique-code';

const BATCH_SIZE = 100;

type DbClient = Pick<PrismaClient, '$queryRaw' | '$executeRaw' | 'user'>;

async function nextUniqueCode(client: DbClient): Promise<string> {
  const rows = await client.$queryRaw<{ code: string }[]>`
    SELECT lpad(nextval('player_unique_code_seq')::text, 8, '0') AS code
  `;
  const code = rows[0]?.code;
  if (!code) {
    throw new Error('Failed to allocate code from player_unique_code_seq.');
  }
  return code;
}

async function syncSequenceToMax(client: DbClient) {
  await client.$executeRaw`
    SELECT setval(
      'player_unique_code_seq',
      GREATEST(
        10000000,
        COALESCE(
          (
            SELECT MAX(username::bigint)
            FROM "User"
            WHERE username ~ '^[0-9]{8}$'
          ),
          9999999
        ) + 1
      ),
      false
    )
  `;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const players = await prisma.user.findMany({
      where: { role: UserRole.PLAYER },
      select: { id: true, username: true, firstName: true, lastName: true },
      orderBy: { createdAt: 'asc' },
    });

    const needsBackfill = players.filter((p) => !isValidUniqueCode(p.username));
    console.log(
      `Found ${needsBackfill.length} player(s) needing numeric unique codes (${players.length} total players).`,
    );

    let updated = 0;
    for (let i = 0; i < needsBackfill.length; i += BATCH_SIZE) {
      const batch = needsBackfill.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(async (tx) => {
        for (const player of batch) {
          let assigned = false;
          for (let attempt = 0; attempt < 5 && !assigned; attempt++) {
            const code = await nextUniqueCode(tx);
            try {
              await tx.user.update({
                where: { id: player.id },
                data: { username: code },
              });
              console.log(
                `  ${player.firstName} ${player.lastName}: ${player.username} → ${code}`,
              );
              updated++;
              assigned = true;
            } catch (err: unknown) {
              const codeConflict =
                err &&
                typeof err === 'object' &&
                'code' in err &&
                (err as { code: string }).code === 'P2002';
              if (!codeConflict) throw err;
            }
          }
          if (!assigned) {
            throw new Error(
              `Could not assign unique code to player ${player.id} after retries.`,
            );
          }
        }
      });
    }

    await syncSequenceToMax(prisma);

    const [{ next_code }] = await prisma.$queryRaw<{ next_code: string }[]>`
      SELECT lpad(last_value::text, 8, '0') AS next_code
      FROM player_unique_code_seq
    `;

    console.log(`\nBackfill complete. Updated ${updated} player(s).`);
    console.log(
      `Next registration will receive code starting from: ${next_code}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
