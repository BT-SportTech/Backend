import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Raw invite token from the email link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'Secret@123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    example: 'priya_sharma',
    description: 'Optional username; defaults from email local-part',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: 'Username can only use letters, numbers, . and _',
  })
  username?: string;
}
