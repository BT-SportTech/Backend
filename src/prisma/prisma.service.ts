import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import parse from 'pg-connection-string';
import { Pool, PoolConfig } from 'pg';

function needsSsl(connectionString: string) {
  return (
    connectionString.includes('supabase.co') ||
    connectionString.includes('pooler.supabase.com') ||
    /[?&]sslmode=(?!disable)/i.test(connectionString) ||
    process.env.DATABASE_SSL === 'true'
  );
}

/** pg v8 treats sslmode=require as verify-full; strip it and set ssl explicitly. */
function connectionStringWithoutSslParams(connectionString: string) {
  return connectionString
    .replace(/([?&])sslmode=[^&]*/gi, '$1')
    .replace(/([?&])ssl=(?:true|1)[^&]*/gi, '$1')
    .replace(/([?&])uselibpqcompat=[^&]*/gi, '$1')
    .replace(/[?&]$/, '')
    .replace(/\?&/, '?')
    .replace(/&&+/g, '&');
}

function poolConfigFromDatabaseUrl(rawUrl: string): PoolConfig {
  const useSsl = needsSsl(rawUrl);
  const parsed = parse.parse(
    connectionStringWithoutSslParams(rawUrl),
  ) as PoolConfig & {
    sslmode?: string;
    pgbouncer?: string;
    connection_limit?: string;
  };

  // Prisma/Supabase query params — not valid pg Pool keys.
  delete parsed.sslmode;
  delete parsed.pgbouncer;
  delete parsed.connection_limit;

  // Do not pass connectionString: pg re-parses it and sslmode=require overwrites ssl.
  delete parsed.ssl;

  return {
    ...parsed,
    max: 1,
    idleTimeoutMillis: 14_000,
    connectionTimeoutMillis: 10_000,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly pool: Pool;

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    const pool = new Pool(poolConfigFromDatabaseUrl(rawUrl));

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
