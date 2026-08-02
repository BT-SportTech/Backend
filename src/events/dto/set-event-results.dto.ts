import { ApiProperty } from '@nestjs/swagger';
import { MatchOutcome } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class EventResultItemDto {
  @ApiProperty({ example: 'cluser123' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: MatchOutcome, example: MatchOutcome.WIN })
  @IsEnum(MatchOutcome)
  outcome: MatchOutcome;
}

export class SetEventResultsDto {
  @ApiProperty({ type: [EventResultItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EventResultItemDto)
  results: EventResultItemDto[];
}
