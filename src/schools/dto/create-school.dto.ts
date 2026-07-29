import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'Delhi Public School' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'DPS-HYD-001', description: 'Unique school registration code' })
  @IsString()
  code: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiProperty({
    enum: SchoolType,
    example: SchoolType.PRIVATE,
  })
  @IsEnum(SchoolType)
  type: SchoolType;

  @ApiPropertyOptional({ example: 1995 })
  @IsOptional()
  @IsInt()
  yearEstablished?: number;

  @ApiPropertyOptional({ example: 'ABC Education Trust' })
  @IsOptional()
  @IsString()
  managingOrganization?: string;

  @ApiPropertyOptional({ example: 'Dr. Anil Mehta' })
  @IsOptional()
  @IsString()
  principalName?: string;

  @ApiPropertyOptional({ example: 'Suresh Reddy' })
  @IsOptional()
  @IsString()
  chairmanName?: string;

  @ApiPropertyOptional({ example: 'Excellence in Sports & Academics' })
  @IsOptional()
  @IsString()
  tagline?: string;

  @ApiPropertyOptional({ example: 'https://www.dpshyd.edu.in' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: '04012345678' })
  @IsOptional()
  @IsString()
  contactNumber?: string;

  @ApiPropertyOptional({ example: 'info@dpshyd.edu.in' })
  @IsOptional()
  @IsString()
  email?: string;

  // 2. Location
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

  @ApiPropertyOptional({ example: 'Near Jubilee Hills Check Post' })
  @IsOptional()
  @IsString()
  landmark?: string;

  @ApiPropertyOptional({ example: 'Road No. 1, Jubilee Hills, Hyderabad' })
  @IsOptional()
  @IsString()
  fullAddress?: string;

  @ApiPropertyOptional({ example: '500033' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({ example: 'https://maps.google.com/?q=17.43,78.40' })
  @IsOptional()
  @IsString()
  googleMapsUrl?: string;

  @ApiPropertyOptional({ example: 17.4326 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 78.407 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  // 6. Infrastructure
  @ApiPropertyOptional({ example: '10 acres' })
  @IsOptional()
  @IsString()
  campusArea?: string;

  @ApiPropertyOptional({ example: 'Olympic-size outdoor ground' })
  @IsOptional()
  @IsString()
  playground?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Cricket pitch', 'Football turf', 'Basketball court'],
  })
  @IsOptional()
  @IsString({ each: true })
  sportsFacilities?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasSwimmingPool?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasIndoorSportsArena?: boolean;

  // 7. Faculty
  @ApiPropertyOptional({ example: 'Coach Ravi Kumar' })
  @IsOptional()
  @IsString()
  sportsInstructor?: string;

  // 8. Student counts
  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @IsInt()
  totalStudents?: number;

  @ApiPropertyOptional({ example: 1300 })
  @IsOptional()
  @IsInt()
  boysCount?: number;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsInt()
  girlsCount?: number;

  @ApiPropertyOptional({ example: 800 })
  @IsOptional()
  @IsInt()
  boysEnrolled?: number;

  @ApiPropertyOptional({ example: 750 })
  @IsOptional()
  @IsInt()
  girlsEnrolled?: number;

  // 16. Media
  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/campus1.jpg'],
  })
  @IsOptional()
  @IsString({ each: true })
  campusPhotos?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/event1.jpg'],
  })
  @IsOptional()
  @IsString({ each: true })
  eventPhotos?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/sports1.jpg'],
  })
  @IsOptional()
  @IsString({ each: true })
  sportsEventPhotos?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['https://cdn.example.com/tour.mp4'],
  })
  @IsOptional()
  @IsString({ each: true })
  videos?: string[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/virtual-tour' })
  @IsOptional()
  @IsString()
  virtualTourUrl?: string;

  // 17. Awards
  @ApiPropertyOptional({
    type: [String],
    example: ['Best Sports School 2024'],
  })
  @IsOptional()
  @IsString({ each: true })
  bestSchoolAwards?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['CBSE Affiliation'],
  })
  @IsOptional()
  @IsString({ each: true })
  governmentRecognitions?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['ISO 9001'],
  })
  @IsOptional()
  @IsString({ each: true })
  accreditationDetails?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['EducationWorld Top 10'],
  })
  @IsOptional()
  @IsString({ each: true })
  rankings?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['Green School Certificate'],
  })
  @IsOptional()
  @IsString({ each: true })
  certifications?: string[];
}
