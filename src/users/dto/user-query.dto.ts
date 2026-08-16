import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Gender, UserRole } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { RANK_TIERS, type RankTier } from '../../common/rank-tier';

export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: UserRole,
    example: UserRole.PLAYER,
    description: 'Filter by role',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: Gender, example: Gender.MALE })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

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
    description: 'Filter players by school id',
  })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional({
    enum: RANK_TIERS,
    example: 'Rookie',
    description: 'Filter players by points-based rank tier',
  })
  @IsOptional()
  @IsIn([...RANK_TIERS])
  rank?: RankTier;
}
