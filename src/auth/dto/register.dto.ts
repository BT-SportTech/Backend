import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Rahul Sharma', description: 'Full name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiPropertyOptional({
    example: '',
    description: 'Deprecated — leave empty; full name is stored in firstName',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    example: '12345678',
    description:
      'Deprecated — ignored. Server assigns an 8-digit numeric unique code.',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'rahul@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '123456', description: '6-digit Mpin' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mpin must be exactly 6 digits' })
  password: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    enum: ['PLAYER', 'PROFESSIONAL'],
    example: 'PLAYER',
  })
  @IsEnum(['PLAYER', 'PROFESSIONAL'])
  role: 'PLAYER' | 'PROFESSIONAL';

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '2008-05-15', description: 'ISO date string YYYY-MM-DD' })
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Telangana' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Hyderabad' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ example: 'Hyderabad' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '500001' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Cricket', 'Football'],
  })
  @IsOptional()
  @IsString({ each: true })
  sportsInterested?: string[];

  @ApiPropertyOptional({
    example: 'clxyz123schoolid',
    description: 'Optional registered school id for players',
  })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    maximum: 12,
    description: 'Optional class 1–12 for players',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  presentClass?: number;

  @ApiPropertyOptional({
    example: 'Acme Corp',
    description: 'Required when role is PROFESSIONAL',
  })
  @ValidateIf((o: RegisterDto) => o.role === 'PROFESSIONAL')
  @IsString()
  @IsNotEmpty()
  company?: string;
}
