import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { AgeCategory, Gender } from '@prisma/client';

export class CreateEventDto {
  @ApiProperty({ example: 'Urban Football Cup' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    example: 'clxyzgameid',
    description: 'ID of an active game from the Games catalog',
  })
  @IsString()
  @MinLength(1)
  gameId: string;

  @ApiPropertyOptional({ example: '5-a-side tournament for school teams.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'Indiranagar Sports Complex' })
  @IsString()
  @MinLength(2)
  venue: string;

  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  @IsDateString()
  startsAt: string;

  @ApiPropertyOptional({ example: '2026-09-15T16:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  @IsDateString()
  registrationOpensAt: string;

  @ApiProperty({ example: '2026-09-10T23:59:59.000Z' })
  @IsDateString()
  registrationClosesAt: string;

  @ApiProperty({ example: 40, minimum: 1 })
  @IsInt()
  @Min(1)
  maxParticipants: number;

  @ApiPropertyOptional({
    example: 'Karnataka',
    description: 'Optional zone state. Empty with district = nationwide',
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({
    example: 'Bengaluru Urban',
    description: 'Optional zone district. Empty with state = nationwide',
  })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ enum: AgeCategory, example: AgeCategory.U16 })
  @IsEnum(AgeCategory)
  ageCategory: AgeCategory;

  @ApiPropertyOptional({
    enum: Gender,
    isArray: true,
    example: [Gender.MALE, Gender.FEMALE],
    description: 'Empty or omitted = all genders eligible',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Gender, { each: true })
  genders?: Gender[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Optional school IDs. Empty = all schools in zone',
    example: [],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  schoolIds?: string[];

  @ApiPropertyOptional({ example: 399, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Defaults to game.winPoints when omitted',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsReward?: number;

  @ApiPropertyOptional({
    example: '/uploads/event-images/123.jpg',
    description: 'URL from POST /events/upload-image',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Organizer user IDs to assign to this event',
    example: [],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  organizerIds?: string[];

  @ApiPropertyOptional({
    example: 25,
    description: 'Number of chess boards (required for Chess events)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  boardCount?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Games each player plays (chess events, default 3)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  gamesPerPlayer?: number;
}
