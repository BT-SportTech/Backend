import { ApiProperty } from '@nestjs/swagger';
import { MatchOutcome } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SetRegistrationResultDto {
  @ApiProperty({ enum: MatchOutcome, example: MatchOutcome.WIN })
  @IsEnum(MatchOutcome)
  outcome: MatchOutcome;
}
