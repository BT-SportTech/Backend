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

  @ApiProperty({ example: 'Football' })
  @IsString()
  @MinLength(2)
  sport: string;

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

  @ApiProperty({ example: 'Karnataka' })
  @IsString()
  state: string;

  @ApiProperty({ example: 'Bengaluru Urban' })
  @IsString()
  district: string;

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

  @ApiPropertyOptional({ example: 50, default: 50 })
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
}
