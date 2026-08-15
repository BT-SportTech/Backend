import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { ChessController } from './chess.controller';
import { ChessMatchmakingService } from './chess-matchmaking.service';
import { ChessRankingsController } from './chess-rankings.controller';
import { ChessRankingsService } from './chess-rankings.service';
import { ChessRatingService } from './chess-rating.service';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [ChessController, ChessRankingsController],
  providers: [
    ChessMatchmakingService,
    ChessRatingService,
    ChessRankingsService,
  ],
  exports: [ChessMatchmakingService, ChessRatingService, ChessRankingsService],
})
export class ChessModule {}
