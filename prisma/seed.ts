import 'dotenv/config';
import { PrismaClient, UserRole } from '.prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@sporttech.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin@123';

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        firstName: 'Super',
        lastName: 'Admin',
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
      },
    });
    console.log(`Admin user created: ${adminEmail}`);
  } else {
    console.log('Admin user already exists, skipping admin seed.');
  }

  const starters = [
    { name: 'Chess', sidesPerMatch: 2, playersPerSide: 1, winPoints: 50, lossPoints: 10 },
    { name: 'Football', sidesPerMatch: 2, playersPerSide: 11, winPoints: 100, lossPoints: 20 },
    { name: 'Basketball', sidesPerMatch: 2, playersPerSide: 5, winPoints: 80, lossPoints: 15 },
    { name: 'Badminton', sidesPerMatch: 2, playersPerSide: 1, winPoints: 40, lossPoints: 8 },
  ];

  for (const g of starters) {
    await prisma.game.upsert({
      where: { name: g.name },
      create: g,
      update: {},
    });
  }
  console.log(`Seeded ${starters.length} starter games.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
