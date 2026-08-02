import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Same phone number OTP was sent to',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Enter a valid phone number',
  })
  phone: string;

  @ApiProperty({
    example: '5D6EBEE6-EC04-4776-846D-3600422BD9EF',
    description: 'Session id returned from send OTP',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP from SMS' })
  @IsString()
  @IsNotEmpty()
  @Length(4, 8)
  @Matches(/^[0-9]+$/, { message: 'OTP must be numeric' })
  otp: string;
}
