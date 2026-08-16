import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateGameDto {
  @ApiProperty({ example: 'Chess' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: '/uploads/game-images/123.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: 2, minimum: 2, default: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  sidesPerMatch: number = 2;

  @ApiProperty({ example: 1, minimum: 1, description: 'Chess=1, Football=11' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  playersPerSide: number;

  @ApiPropertyOptional({ example: 50, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  winPoints?: number;

  @ApiPropertyOptional({
    example: -50,
    default: 0,
    description: 'Points applied on loss (may be negative for chess)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lossPoints?: number;
}
