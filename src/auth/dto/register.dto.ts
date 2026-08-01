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
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'Rahul' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Sharma' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'rahul@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Secret@123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    enum: ['STUDENT', 'PROFESSIONAL'],
    example: 'STUDENT',
    description: 'STUDENT requires schoolId; PROFESSIONAL requires company',
  })
  @IsEnum(['STUDENT', 'PROFESSIONAL'])
  role: 'STUDENT' | 'PROFESSIONAL';

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
    description: 'Required when role is STUDENT — registered school id',
  })
  @ValidateIf((o: RegisterDto) => o.role === 'STUDENT')
  @IsString()
  @IsNotEmpty()
  schoolId?: string;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    maximum: 12,
    description: 'Optional class 1–12 for students/players',
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
