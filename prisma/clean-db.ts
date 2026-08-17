/**
 * Script to completely remove all data from the database (clear all tables).
 * Schema and migration history (_prisma_migrations) are preserved.
 *
 * Usage:
 *   npm run prisma:clean
 *   OR
 *   npx tsx -r dotenv/config prisma/clean-db.ts
 *
 * Optional flags:
 *   --seed   Automatically run seed script after cleaning data
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { execSync } from 'child_process';

async function main() {
  const shouldSeed = process.argv.includes('--seed');
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ Error: DATABASE_URL environment variable is not defined.');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log('⚠️  Starting database data cleanup...');

  try {
    // Retrieve all public table names except Prisma migration tracking table
    const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename != '_prisma_migrations';
    `;

    if (tablenames.length === 0) {
      console.log('ℹ️  No user tables found in database.');
      return;
    }

    const tableList = tablenames.map((t) => t.tablename);
    const formattedTables = tablenames.map((t) => `"${t.tablename}"`).join(', ');

    console.log(`🧹 Truncating ${tableList.length} table(s):`);
    tableList.forEach((name) => console.log(`   - ${name}`));

    // Truncate all public tables with CASCADE & RESTART IDENTITY
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${formattedTables} RESTART IDENTITY CASCADE;`,
    );

    console.log('\n✨ Database data has been completely cleared!');

    if (shouldSeed) {
      console.log('\n🌱 Running seed script...');
      execSync('npx tsx -r dotenv/config prisma/seed.ts', { stdio: 'inherit' });
      console.log('✅ Re-seeding completed.');
    } else {
      console.log(
        '\n💡 Tip: Run "npm run prisma:seed" if you want to populate default admin, organizer, and starter games.',
      );
    }
  } catch (error) {
    console.error('❌ Failed to clean database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
