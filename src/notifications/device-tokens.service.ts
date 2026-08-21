import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeviceTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, token: string, platform: 'android' | 'ios') {
    const normalized = token.trim();
    return this.prisma.deviceToken.upsert({
      where: { token: normalized },
      create: {
        userId,
        token: normalized,
        platform,
      },
      update: {
        userId,
        platform,
      },
    });
  }

  async remove(userId: string, token: string) {
    const normalized = token.trim();
    await this.prisma.deviceToken.deleteMany({
      where: { userId, token: normalized },
    });
    return { ok: true };
  }

  async removeAllForUser(userId: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async tokensForUser(userId: string) {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return rows.map((row) => row.token);
  }

  async tokensForUsers(userIds: string[]) {
    if (userIds.length === 0) return [];
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });
    return rows.map((row) => row.token);
  }

  async deleteTokens(tokens: string[]) {
    if (tokens.length === 0) return;
    await this.prisma.deviceToken.deleteMany({
      where: { token: { in: tokens } },
    });
  }
}
