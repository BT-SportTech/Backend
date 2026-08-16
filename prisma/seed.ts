import 'dotenv/config';
import { PrismaClient, UserRole } from '.prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@sporttech.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@123';
  const adminUsername = 'admin';

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: adminEmail }, { username: adminUsername }] },
  });
  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        firstName: 'Super',
        lastName: 'Admin',
        username: adminUsername,
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
      },
    });
    console.log(`Admin user created: ${adminUsername} / ${adminEmail}`);
  } else {
    console.log('Admin user already exists, skipping admin seed.');
  }

  const organizerEmail =
    process.env.ORGANIZER_EMAIL ?? 'organiser@sporttech.com';
  const organizerPassword = process.env.ORGANIZER_PASSWORD ?? 'Organiser@123';
  const organizerUsername = 'organiser';

  const existingOrganizer = await prisma.user.findFirst({
    where: {
      OR: [{ email: organizerEmail }, { username: organizerUsername }],
    },
  });
  if (!existingOrganizer) {
    const passwordHash = await bcrypt.hash(organizerPassword, 10);
    await prisma.user.create({
      data: {
        firstName: 'Demo',
        lastName: 'Organiser',
        username: organizerUsername,
        email: organizerEmail,
        passwordHash,
        role: UserRole.ORGANIZER,
        sportsInterested: [],
      },
    });
    console.log(
      `Organizer user created: ${organizerUsername} / ${organizerEmail}`,
    );
  } else if (existingOrganizer.role !== UserRole.ORGANIZER) {
    console.log(
      `User ${existingOrganizer.username} exists but is not ORGANIZER — skipping organizer seed.`,
    );
  } else {
    console.log('Organizer user already exists, skipping organizer seed.');
  }

  const starters = [
    { name: 'Chess', sidesPerMatch: 2, playersPerSide: 1, winPoints: 100, lossPoints: -50 },
    { name: 'Table Tennis', sidesPerMatch: 2, playersPerSide: 1, winPoints: 40, lossPoints: 8 },
    { name: 'Tennis', sidesPerMatch: 2, playersPerSide: 1, winPoints: 50, lossPoints: 10 },
    { name: 'Badminton', sidesPerMatch: 2, playersPerSide: 1, winPoints: 40, lossPoints: 8 },
    { name: 'Football', sidesPerMatch: 2, playersPerSide: 11, winPoints: 100, lossPoints: 20 },
  ];

  for (const g of starters) {
    await prisma.game.upsert({
      where: { name: g.name },
      create: g,
      update: {
        winPoints: g.winPoints,
        lossPoints: g.lossPoints,
        sidesPerMatch: g.sidesPerMatch,
        playersPerSide: g.playersPerSide,
      },
    });
  }
  console.log(`Seeded ${starters.length} starter games.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
