import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import * as Prisma from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ChessRankingsService } from './chess-rankings.service';

@ApiTags('chess')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('chess')
export class ChessRankingsController {
  constructor(private readonly rankingsService: ChessRankingsService) {}

  @Get('rankings')
  @ApiOperation({ summary: 'List chess player ratings (ranked by rating)' })
  listRankings(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : 100;
    return this.rankingsService.listRankings(take);
  }

  @Get('rankings/nearby')
  @ApiOperation({
    summary: 'Get current player rank with one player above and below',
  })
  nearby(@CurrentUser() user: Prisma.User) {
    return this.rankingsService.nearbyForUser(user.id);
  }
}
