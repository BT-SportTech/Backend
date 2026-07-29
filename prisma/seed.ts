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
  if (existing) {
    console.log('Admin user already exists, skipping seed.');
    await prisma.$disconnect();
    return;
  }

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
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
