import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Indian mobile number (10 digits) or with country code 91',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Enter a valid phone number',
  })
  phone: string;

  @ApiPropertyOptional({
    example: 'OTP1',
    description: 'Optional 2Factor OTP template name',
  })
  @IsOptional()
  @IsString()
  template?: string;
}
