import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class ResetMpinDto {
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

  @ApiProperty({
    example: 'clxyz123userid',
    description: 'Profile id to reset MPIN for',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({ example: '123456', description: 'New 6-digit Mpin' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mpin must be exactly 6 digits' })
  password: string;
}
