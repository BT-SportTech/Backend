import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChessController } from './chess.controller';
import { ChessMatchmakingService } from './chess-matchmaking.service';
import { ChessRatingService } from './chess-rating.service';

@Module({
  imports: [PrismaModule],
  controllers: [ChessController],
  providers: [ChessMatchmakingService, ChessRatingService],
  exports: [ChessMatchmakingService, ChessRatingService],
})
export class ChessModule {}
