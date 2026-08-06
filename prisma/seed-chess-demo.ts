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
  { firstName: 'Aarav', lastName: 'Sharma', username: 'aarav_chess', age: 14 },
  { firstName: 'Diya', lastName: 'Patel', username: 'diya_chess', age: 15 },
  { firstName: 'Kabir', lastName: 'Reddy', username: 'kabir_chess', age: 16 },
  { firstName: 'Ananya', lastName: 'Iyer', username: 'ananya_chess', age: 17 },
  { firstName: 'Rohan', lastName: 'Mehta', username: 'rohan_chess', age: 18 },
  { firstName: 'Ishita', lastName: 'Nair', username: 'ishita_chess', age: 22 },
  { firstName: 'Vikram', lastName: 'Singh', username: 'vikram_chess', age: 28 },
  { firstName: 'Meera', lastName: 'Kapoor', username: 'meera_chess', age: 35 },
  { firstName: 'Arjun', lastName: 'Das', username: 'arjun_chess', age: 42 },
  { firstName: 'Sneha', lastName: 'Joshi', username: 'sneha_chess', age: 45 },
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

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const existing = await prisma.user.findUnique({
      where: { username: p.username },
    });
    if (existing) {
      playerIds.push(existing.id);
      console.log(`Player exists: ${p.username}`);
      continue;
    }
    const created = await prisma.user.create({
      data: {
        firstName: p.firstName,
        lastName: p.lastName,
        username: p.username,
        email: `${p.username}@demo.sporttech.com`,
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
    console.log(`Created player: ${p.username} (age ${p.age})`);
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
