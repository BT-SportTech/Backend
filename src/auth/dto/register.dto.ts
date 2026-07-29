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
import { Gender, UserRole } from '@prisma/client';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsEnum(UserRole)
  role: 'STUDENT' | 'PROFESSIONAL';

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString({ each: true })
  sportsInterested?: string[];

  // Student fields
  @ValidateIf((o: RegisterDto) => o.role === 'STUDENT')
  @IsString()
  @IsNotEmpty()
  schoolId?: string;

  @ValidateIf((o: RegisterDto) => o.role === 'STUDENT')
  @IsInt()
  @Min(1)
  @Max(12)
  presentClass?: number;

  // Professional fields
  @ValidateIf((o: RegisterDto) => o.role === 'PROFESSIONAL')
  @IsString()
  @IsNotEmpty()
  company?: string;
}
