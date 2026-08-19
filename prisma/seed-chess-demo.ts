/**
 * Demo seed: chess event + players ready for organizer attendance.
 * Run: npx tsx -r dotenv/config prisma/seed-chess-demo.ts
 */
import 'dotenv/config';
import {
  AgeCategory,
  EventStatus,
  Gender,
  PrismaClient,
  RegistrationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const PLAYER_PASSWORD = 'Player@123';

const players = [
  { firstName: 'Aarav', lastName: 'Sharma', uniqueCode: '10000001', age: 14 },
  { firstName: 'Diya', lastName: 'Patel', uniqueCode: '10000002', age: 15 },
  { firstName: 'Kabir', lastName: 'Reddy', uniqueCode: '10000003', age: 16 },
  { firstName: 'Ananya', lastName: 'Iyer', uniqueCode: '10000004', age: 17 },
  { firstName: 'Rohan', lastName: 'Mehta', uniqueCode: '10000005', age: 18 },
  { firstName: 'Ishita', lastName: 'Nair', uniqueCode: '10000006', age: 22 },
  { firstName: 'Vikram', lastName: 'Singh', uniqueCode: '10000007', age: 28 },
  { firstName: 'Meera', lastName: 'Kapoor', uniqueCode: '10000008', age: 35 },
  { firstName: 'Arjun', lastName: 'Das', uniqueCode: '10000009', age: 42 },
  { firstName: 'Sneha', lastName: 'Joshi', uniqueCode: '10000010', age: 45 },
] as const;

function dobFromAge(age: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setMonth(0);
  d.setDate(15);
  return d;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const chess = await prisma.game.findFirst({
    where: { name: 'Chess', isActive: true },
  });
  if (!chess) {
    throw new Error('Chess game not found. Run prisma:seed first.');
  }

  const admin =
    (await prisma.user.findFirst({ where: { role: UserRole.ADMIN } })) ??
    (await prisma.user.create({
      data: {
        firstName: 'Super',
        lastName: 'Admin',
        username: 'admin',
        email: 'admin@sporttech.com',
        passwordHash: await bcrypt.hash('Admin@123', 10),
        role: UserRole.ADMIN,
        sportsInterested: [],
      },
    }));

  let organizer = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'organiser' },
        { email: 'organiser@sporttech.com' },
      ],
    },
  });
  if (!organizer) {
    organizer = await prisma.user.create({
      data: {
        firstName: 'Demo',
        lastName: 'Organiser',
        username: 'organiser',
        email: 'organiser@sporttech.com',
        passwordHash: await bcrypt.hash('Organiser@123', 10),
        role: UserRole.ORGANIZER,
        sportsInterested: [],
      },
    });
    console.log('Created organizer: organiser / Organiser@123');
  } else if (organizer.role !== UserRole.ORGANIZER) {
    organizer = await prisma.user.update({
      where: { id: organizer.id },
      data: { role: UserRole.ORGANIZER },
    });
  }

  const passwordHash = await bcrypt.hash(PLAYER_PASSWORD, 10);
  const playerIds: string[] = [];

  async function nextSequenceCode(): Promise<string> {
    const rows = await prisma.$queryRaw<{ code: string }[]>`
      SELECT lpad(nextval('player_unique_code_seq')::text, 8, '0') AS code
    `;
    return rows[0]!.code;
  }

  async function assignDemoUsername(userId: string, uniqueCode: string) {
    const holder = await prisma.user.findUnique({
      where: { username: uniqueCode },
    });
    if (holder && holder.id !== userId) {
      const replacement = await nextSequenceCode();
      await prisma.user.update({
        where: { id: holder.id },
        data: { username: replacement },
      });
      console.log(
        `  Moved ${holder.firstName} ${holder.lastName} from ${uniqueCode} → ${replacement}`,
      );
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        username: uniqueCode,
        email: `${uniqueCode}@demo.sporttech.com`,
      },
    });
  }

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    let existing = await prisma.user.findFirst({
      where: {
        firstName: p.firstName,
        lastName: p.lastName,
        role: UserRole.PLAYER,
        email: { endsWith: '@demo.sporttech.com' },
      },
    });

    if (existing) {
      if (existing.username !== p.uniqueCode) {
        await assignDemoUsername(existing.id, p.uniqueCode);
        console.log(
          `Updated demo player code: ${p.firstName} ${p.lastName} → ${p.uniqueCode}`,
        );
      }
      playerIds.push(existing.id);
      console.log(`Player exists: ${p.uniqueCode} (${p.firstName} ${p.lastName})`);
      continue;
    }

    const holder = await prisma.user.findUnique({
      where: { username: p.uniqueCode },
    });
    if (holder) {
      const replacement = await nextSequenceCode();
      await prisma.user.update({
        where: { id: holder.id },
        data: { username: replacement },
      });
    }

    const created = await prisma.user.create({
      data: {
        firstName: p.firstName,
        lastName: p.lastName,
        username: p.uniqueCode,
        email: `${p.uniqueCode}@demo.sporttech.com`,
        passwordHash,
        role: UserRole.PLAYER,
        gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
        dateOfBirth: dobFromAge(p.age),
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        sportsInterested: ['Chess'],
      },
    });
    playerIds.push(created.id);
    console.log(
      `Created player: ${p.uniqueCode} (${p.firstName} ${p.lastName}, age ${p.age})`,
    );
  }

  // Attendance opens 30 min before start — set start to ~10 min from now
  const now = new Date();
  const startsAt = new Date(now.getTime() + 10 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
  const registrationOpensAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const registrationClosesAt = new Date(now.getTime() - 60 * 1000);

  const eventName = 'Demo Chess Open — Attendance Ready';

  const existingEvent = await prisma.event.findFirst({
    where: {
      name: eventName,
      status: EventStatus.PUBLISHED,
    },
  });

  let eventId: string;
  if (existingEvent) {
    eventId = existingEvent.id;
    await prisma.event.update({
      where: { id: eventId },
      data: {
        startsAt,
        endsAt,
        boardCount: 4,
        gamesPerPlayer: 3,
        matchmakingStatus: 'NOT_STARTED',
        matchmakingStartedAt: null,
      },
    });
    console.log(`Updated existing event startsAt to keep attendance open: ${eventId}`);
  } else {
    const event = await prisma.event.create({
      data: {
        name: eventName,
        sport: 'Chess',
        description:
          'Demo chess tournament for testing attendance and matchmaking. 10 players, 4 boards, 3 games each.',
        venue: 'Indiranagar Sports Complex — Chess Hall',
        startsAt,
        endsAt,
        registrationOpensAt,
        registrationClosesAt,
        maxParticipants: 40,
        status: EventStatus.PUBLISHED,
        ageCategory: AgeCategory.OPEN,
        genders: [],
        fee: 0,
        pointsReward: chess.winPoints,
        lossPoints: chess.lossPoints,
        boardCount: 4,
        gamesPerPlayer: 3,
        gameId: chess.id,
        createdById: admin.id,
        organizers: {
          create: [{ userId: organizer.id }],
        },
      },
    });
    eventId = event.id;
    console.log(`Created chess event: ${eventId}`);
  }

  // Ensure organizer assignment
  await prisma.eventOrganizer.upsert({
    where: {
      eventId_userId: { eventId, userId: organizer.id },
    },
    create: { eventId, userId: organizer.id },
    update: {},
  });

  for (const userId of playerIds) {
    await prisma.eventRegistration.upsert({
      where: {
        eventId_userId: { eventId, userId },
      },
      create: {
        eventId,
        userId,
        status: RegistrationStatus.CONFIRMED,
      },
      update: {
        status: RegistrationStatus.CONFIRMED,
        withdrawnAt: null,
        withdrawnById: null,
        attendedAt: null,
        attendedById: null,
        gamesCompleted: 0,
        eventWins: 0,
        eventLosses: 0,
        eventDraws: 0,
        whiteGames: 0,
        blackGames: 0,
        outcome: null,
        pointsEarned: 0,
      },
    });
  }

  // Clear any prior chess rounds for a clean attendance demo
  await prisma.chessMatch.deleteMany({
    where: { batch: { round: { eventId } } },
  });
  await prisma.chessRoundBatch.deleteMany({
    where: { round: { eventId } },
  });
  await prisma.chessRound.deleteMany({ where: { eventId } });

  await prisma.$executeRaw`
    SELECT setval(
      'player_unique_code_seq',
      GREATEST(
        10000011,
        COALESCE(
          (
            SELECT MAX(username::bigint)
            FROM "User"
            WHERE username ~ '^[0-9]{8}$'
          ),
          10000010
        ) + 1
      ),
      false
    )
  `;

  console.log('\n── Demo ready ─────────────────────────────────');
  console.log('Organizer login:');
  console.log('  username: organiser');
  console.log('  password: Organiser@123');
  console.log(`Event: ${eventName}`);
  console.log(`Event ID: ${eventId}`);
  console.log(`Starts at: ${startsAt.toISOString()} (attendance window OPEN)`);
  console.log(`Boards: 4 · Players registered: ${playerIds.length}`);
  console.log('Open: /organizer → Demo Chess Open — Attendance Ready');
  console.log('Mark attendance, then Start matchmaking.');
  console.log('Player password (all): Player@123');
  console.log('────────────────────────────────────────────────\n');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
