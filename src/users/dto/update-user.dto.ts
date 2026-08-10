import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Rahul' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Sharma' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'rahul@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '2008-05-15' })
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
    example: 'clxyz123schoolid',
    description:
      'School link for students. Cleared when company is set. Pass null to unlink.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  schoolId?: string | null;

  @ApiPropertyOptional({ type: [String], example: ['Cricket', 'Badminton'] })
  @IsOptional()
  @IsString({ each: true })
  sportsInterested?: string[];

  @ApiPropertyOptional({
    example: 'Acme Corp',
    description:
      'Company/organization for open category (employees, seniors, etc.). Cleared when schoolId is set. Pass null to clear.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  company?: string | null;
}
