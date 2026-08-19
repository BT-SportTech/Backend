import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: '12345678',
    description: '8-digit numeric unique code',
  })
  @ValidateIf((o: LoginDto) => !o.email && !o.phone)
  @IsString()
  @IsNotEmpty()
  username?: string;

  @ApiPropertyOptional({
    example: 'admin@Sportech.com',
    description: 'Email (accepted for admin/web login)',
  })
  @ValidateIf((o: LoginDto) => !o.username && !o.phone)
  @IsString()
  @IsNotEmpty()
  email?: string;

  @ApiPropertyOptional({
    example: '9876543210',
    description: 'Mobile number — preferred for player login',
  })
  @ValidateIf((o: LoginDto) => !o.username && !o.email)
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Enter a valid phone number',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'Admin@123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
