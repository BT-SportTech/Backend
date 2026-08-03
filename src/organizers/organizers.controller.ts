import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import * as Prisma from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteOrganizerDto } from './dto/invite-organizer.dto';
import { OrganizersService } from './organizers.service';

@ApiTags('organizers')
@Controller('organizers')
export class OrganizersController {
  constructor(private readonly organizersService: OrganizersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Post('invite')
  @ApiOperation({ summary: 'Invite an organizer by email (admin)' })
  invite(@Body() dto: InviteOrganizerDto, @CurrentUser() user: Prisma.User) {
    return this.organizersService.invite(dto, user.id);
  }

  @Get('invite/:token')
  @ApiOperation({ summary: 'Get pending invite details by token (public)' })
  getInvite(@Param('token') token: string) {
    return this.organizersService.getInviteByToken(token);
  }

  @Post('accept-invite')
  @ApiOperation({ summary: 'Accept organizer invite and set password (public)' })
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.organizersService.acceptInvite(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Get()
  @ApiOperation({ summary: 'List organizers and pending invites (admin)' })
  list() {
    return this.organizersService.list();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @Post('invites/:inviteId/resend')
  @ApiOperation({ summary: 'Resend a pending organizer invite (admin)' })
  resend(@Param('inviteId') inviteId: string) {
    return this.organizersService.resendInvite(inviteId);
  }
}
