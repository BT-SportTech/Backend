import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function needsSsl(connectionString: string) {
  return (
    connectionString.includes('supabase.co') ||
    connectionString.includes('pooler.supabase.com') ||
    process.env.DATABASE_SSL === 'true'
  );
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    // Vercel/Lambda: keep the pool tiny; prefer Supabase transaction pooler (6543).
    const pool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 14_000,
      connectionTimeoutMillis: 10_000,
      ssl: needsSsl(connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
    });

    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
