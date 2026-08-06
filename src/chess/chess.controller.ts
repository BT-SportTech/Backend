import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import * as Prisma from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ChessMatchmakingService } from './chess-matchmaking.service';
import { SetChessMatchResultDto } from './dto/set-chess-match-result.dto';
import { StartMatchmakingDto } from './dto/start-matchmaking.dto';

@ApiTags('chess')
@ApiBearerAuth('access-token')
@Controller('events/:id/chess')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChessController {
  constructor(
    private readonly matchmakingService: ChessMatchmakingService,
  ) {}

  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @Post('matchmaking/start')
  @ApiOperation({
    summary: 'Start chess matchmaking (organizer/admin)',
  })
  startMatchmaking(
    @Param('id') eventId: string,
    @Body() dto: StartMatchmakingDto,
    @CurrentUser() user: Prisma.User,
  ) {
    return this.matchmakingService.startMatchmaking(
      eventId,
      user,
      dto.boardCount,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @Post('matchmaking/next-batch')
  @ApiOperation({
    summary: 'Generate next batch after current batch is complete',
  })
  nextBatch(@Param('id') eventId: string, @CurrentUser() user: Prisma.User) {
    return this.matchmakingService.nextBatch(eventId, user);
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @Get('matchmaking')
  @ApiOperation({ summary: 'Get chess matchmaking status' })
  getStatus(@Param('id') eventId: string, @CurrentUser() user: Prisma.User) {
    return this.matchmakingService.getStatus(eventId, user);
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZER, UserRole.PLAYER)
  @Get('matches')
  @ApiOperation({
    summary: 'List chess matches (players see own matches only)',
  })
  listMatches(@Param('id') eventId: string, @CurrentUser() user: Prisma.User) {
    return this.matchmakingService.listMatches(eventId, user);
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @Patch('matches/:matchId/result')
  @ApiOperation({ summary: 'Record result for a chess match' })
  setMatchResult(
    @Param('id') eventId: string,
    @Param('matchId') matchId: string,
    @Body() dto: SetChessMatchResultDto,
    @CurrentUser() user: Prisma.User,
  ) {
    return this.matchmakingService.setMatchResult(
      eventId,
      matchId,
      dto.result,
      user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZER)
  @Post('registrations/:registrationId/withdraw')
  @ApiOperation({
    summary: 'Withdraw a walkout player (preserves attendance for others)',
  })
  withdraw(
    @Param('id') eventId: string,
    @Param('registrationId') registrationId: string,
    @CurrentUser() user: Prisma.User,
  ) {
    return this.matchmakingService.withdrawPlayer(
      eventId,
      registrationId,
      user,
    );
  }
}
