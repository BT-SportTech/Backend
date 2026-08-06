import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class StartMatchmakingDto {
  @ApiPropertyOptional({
    example: 25,
    description: 'Override board count for this event (organizer)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  boardCount?: number;
}
