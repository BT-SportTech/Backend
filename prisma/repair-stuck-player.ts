/**
 * Repair a player stuck at 0 games after odd-count matchmaking bug.
 * Run: npx tsx -r dotenv/config prisma/repair-stuck-player.ts [eventId]
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const eventName = 'Demo Chess Open — Attendance Ready';
  const event =
    (await prisma.event.findFirst({
      where: { name: eventName },
      include: {
        registrations: {
          where: { attendedAt: { not: null }, withdrawnAt: null },
          include: { user: true },
        },
      },
    })) ??
    (process.argv[2]
      ? await prisma.event.findUnique({
          where: { id: process.argv[2] },
          include: {
            registrations: {
              where: { attendedAt: { not: null }, withdrawnAt: null },
              include: { user: true },
            },
          },
        })
      : null);

  if (!event) {
    throw new Error('Event not found');
  }

  const stuck = event.registrations.filter((r) => r.gamesCompleted === 0);
  if (stuck.length === 0) {
    console.log('No stuck players found.');
    await prisma.$disconnect();
    return;
  }

  for (const reg of stuck) {
    const wins = event.gamesPerPlayer;
    await prisma.eventRegistration.update({
      where: { id: reg.id },
      data: {
        gamesCompleted: event.gamesPerPlayer,
        eventWins: wins,
        eventLosses: 0,
        eventDraws: 0,
        outcome: 'WIN',
        pointsEarned: event.pointsReward,
      },
    });
    console.log(
      `Repaired ${reg.user.firstName} ${reg.user.lastName}: granted ${event.gamesPerPlayer} byes (was stuck at 0 games)`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
