import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteOrganizerDto } from './dto/invite-organizer.dto';

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class OrganizersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async invite(dto: InviteOrganizerDto, invitedById: string) {
    const email = dto.email.trim().toLowerCase();
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    const pending = await this.prisma.organizerInvite.findFirst({
      where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending) {
      // Invalidate previous pending invites for this email and create a fresh one
      await this.prisma.organizerInvite.updateMany({
        where: { email, acceptedAt: null },
        data: { expiresAt: new Date() },
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await this.prisma.organizerInvite.create({
      data: {
        email,
        firstName,
        lastName,
        tokenHash,
        expiresAt,
        invitedById,
      },
    });

    const inviteUrl = this.buildInviteUrl(rawToken);
    await this.mail.sendOrganizerInvite({
      to: email,
      firstName,
      inviteUrl,
    });

    return {
      id: invite.id,
      email: invite.email,
      firstName: invite.firstName,
      lastName: invite.lastName,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      status: 'PENDING' as const,
    };
  }

  async getInviteByToken(rawToken: string) {
    const invite = await this.findValidInvite(rawToken);
    return {
      email: invite.email,
      firstName: invite.firstName,
      lastName: invite.lastName,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(dto: AcceptInviteDto) {
    const invite = await this.findValidInvite(dto.token);

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    const username = await this.resolveUsername(
      dto.username?.trim().toLowerCase() ||
        this.usernameFromEmail(invite.email),
    );

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName: invite.firstName,
          lastName: invite.lastName,
          username,
          email: invite.email,
          passwordHash,
          role: UserRole.ORGANIZER,
          sportsInterested: [],
        },
      });

      await tx.organizerInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return created;
    });

    return this.auth.issueTokensForUser(user);
  }

  async list() {
    const [organizers, pendingInvites] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: UserRole.ORGANIZER },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          email: true,
          createdAt: true,
          _count: { select: { organizedEvents: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.organizerInvite.findMany({
        where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      organizers: organizers.map((o) => ({
        id: o.id,
        firstName: o.firstName,
        lastName: o.lastName,
        username: o.username,
        email: o.email,
        createdAt: o.createdAt,
        assignedEventsCount: o._count.organizedEvents,
        status: 'ACTIVE' as const,
      })),
      pendingInvites: pendingInvites.map((i) => ({
        ...i,
        status: 'PENDING' as const,
      })),
    };
  }

  async resendInvite(inviteId: string) {
    const invite = await this.prisma.organizerInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.acceptedAt) {
      throw new BadRequestException('This invite has already been accepted.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const updated = await this.prisma.organizerInvite.update({
      where: { id: invite.id },
      data: { tokenHash, expiresAt },
    });

    const inviteUrl = this.buildInviteUrl(rawToken);
    await this.mail.sendOrganizerInvite({
      to: updated.email,
      firstName: updated.firstName,
      inviteUrl,
    });

    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.firstName,
      lastName: updated.lastName,
      expiresAt: updated.expiresAt,
      createdAt: updated.createdAt,
      status: 'PENDING' as const,
    };
  }

  private async findValidInvite(rawToken: string) {
    if (!rawToken?.trim()) {
      throw new BadRequestException('Invite token is required.');
    }
    const tokenHash = this.hashToken(rawToken.trim());
    const invite = await this.prisma.organizerInvite.findUnique({
      where: { tokenHash },
    });
    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.acceptedAt) {
      throw new BadRequestException('This invite has already been accepted.');
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('This invite has expired.');
    }
    return invite;
  }

  private buildInviteUrl(rawToken: string) {
    const base =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:5173';
    return `${base}/invite/${rawToken}`;
  }

  private usernameFromEmail(email: string) {
    const local = email.split('@')[0] ?? 'organizer';
    const cleaned = local.replace(/[^a-zA-Z0-9._]/g, '_').toLowerCase();
    return cleaned.length >= 3 ? cleaned : `org_${cleaned}`;
  }

  private async resolveUsername(base: string) {
    let candidate = base.slice(0, 40);
    let n = 0;
    while (true) {
      const taken = await this.prisma.user.findUnique({
        where: { username: candidate },
      });
      if (!taken) return candidate;
      n += 1;
      candidate = `${base.slice(0, 36)}_${n}`;
    }
  }

  private hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
