import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: 'a7k2m9xq',
    description: 'Unique code (8 alphanumeric) — preferred for mobile login',
  })
  @ValidateIf((o: LoginDto) => !o.email)
  @IsString()
  @IsNotEmpty()
  username?: string;

  @ApiPropertyOptional({
    example: 'admin@Sportech.com',
    description: 'Email (accepted for admin/web login)',
  })
  @ValidateIf((o: LoginDto) => !o.username)
  @IsString()
  @IsNotEmpty()
  email?: string;

  @ApiPropertyOptional({ example: 'Admin@123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
