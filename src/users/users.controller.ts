import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import * as Prisma from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  me(@CurrentUser() user: Prisma.User) {
    return this.usersService.me(user);
  }

  @Get('me/stats')
  @ApiOperation({ summary: 'Get current user sports stats (played/won/lost/points)' })
  myStats(@CurrentUser() user: Prisma.User) {
    return this.usersService.myStats(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() user: Prisma.User, @Body() dto: UpdateUserDto) {
    return this.usersService.updateMe(user, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  @ApiOperation({
    summary: 'List users with pagination and filters (admin only)',
    description:
      'Query params: page, limit, search, role, gender, state, district, city, pincode, schoolId, rank',
  })
  listAll(@Query() query: UserQueryDto) {
    return this.usersService.listAll(query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id/stats')
  @ApiOperation({ summary: 'Get player sports stats (admin only)' })
  playerStats(@Param('id') id: string) {
    return this.usersService.statsForUserId(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id/registrations')
  @ApiOperation({ summary: 'List player event registrations (admin only)' })
  playerRegistrations(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.usersService.registrationsForUser(id, query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id/matches')
  @ApiOperation({
    summary: 'List player chess matches across events (admin only)',
  })
  playerMatches(
    @Param('id') id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.usersService.matchesForUser(id, query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  @ApiOperation({ summary: 'Get player profile (admin only)' })
  findPlayer(@Param('id') id: string) {
    return this.usersService.findPlayerById(id);
  }
}
