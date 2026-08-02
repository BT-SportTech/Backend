import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import * as Prisma from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
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
      'Query params: page, limit, search, role, gender, state, district, city, pincode, schoolId',
  })
  listAll(@Query() query: UserQueryDto) {
    return this.usersService.listAll(query);
  }
}
