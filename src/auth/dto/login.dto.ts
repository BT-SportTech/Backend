import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, ValidateIf } from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: 'rahul_07',
    description: 'Username (preferred for mobile)',
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
