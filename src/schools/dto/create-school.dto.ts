import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';
import { SchoolType } from '@prisma/client';

export class CreateSchoolDto {
  // 1. Basic
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsEnum(SchoolType)
  type: SchoolType;

  @IsOptional()
  @IsInt()
  yearEstablished?: number;

  @IsOptional()
  @IsString()
  managingOrganization?: string;

  @IsOptional()
  @IsString()
  principalName?: string;

  @IsOptional()
  @IsString()
  chairmanName?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  contactNumber?: string;

  @IsOptional()
  @IsString()
  email?: string;

  // 2. Location
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
  landmark?: string;

  @IsOptional()
  @IsString()
  fullAddress?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsString()
  googleMapsUrl?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  // 6. Infrastructure
  @IsOptional()
  @IsString()
  campusArea?: string;

  @IsOptional()
  @IsString()
  playground?: string;

  @IsOptional()
  @IsString({ each: true })
  sportsFacilities?: string[];

  @IsOptional()
  @IsBoolean()
  hasSwimmingPool?: boolean;

  @IsOptional()
  @IsBoolean()
  hasIndoorSportsArena?: boolean;

  // 7. Faculty
  @IsOptional()
  @IsString()
  sportsInstructor?: string;

  // 8. Student counts
  @IsOptional()
  @IsInt()
  totalStudents?: number;

  @IsOptional()
  @IsInt()
  boysCount?: number;

  @IsOptional()
  @IsInt()
  girlsCount?: number;

  @IsOptional()
  @IsInt()
  boysEnrolled?: number;

  @IsOptional()
  @IsInt()
  girlsEnrolled?: number;

  // 16. Media
  @IsOptional()
  @IsString({ each: true })
  campusPhotos?: string[];

  @IsOptional()
  @IsString({ each: true })
  eventPhotos?: string[];

  @IsOptional()
  @IsString({ each: true })
  sportsEventPhotos?: string[];

  @IsOptional()
  @IsString({ each: true })
  videos?: string[];

  @IsOptional()
  @IsString()
  virtualTourUrl?: string;

  // 17. Awards
  @IsOptional()
  @IsString({ each: true })
  bestSchoolAwards?: string[];

  @IsOptional()
  @IsString({ each: true })
  governmentRecognitions?: string[];

  @IsOptional()
  @IsString({ each: true })
  accreditationDetails?: string[];

  @IsOptional()
  @IsString({ each: true })
  rankings?: string[];

  @IsOptional()
  @IsString({ each: true })
  certifications?: string[];
}
