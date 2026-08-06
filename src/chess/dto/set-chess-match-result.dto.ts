import { ApiProperty } from '@nestjs/swagger';
import { ChessMatchResult } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetChessMatchResultDto {
  @ApiProperty({ enum: ChessMatchResult, example: ChessMatchResult.WHITE_WIN })
  @IsEnum(ChessMatchResult)
  result: ChessMatchResult;
}
