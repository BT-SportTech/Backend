import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { SchoolType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class SchoolQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: SchoolType,
    example: SchoolType.PRIVATE,
    description: 'Filter by school type',
  })
  @IsOptional()
  @IsEnum(SchoolType)
  type?: SchoolType;

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

  @ApiPropertyOptional({ example: '500033' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Include inactive schools (admin). Default: active only',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;
}
