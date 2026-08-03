import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class InviteOrganizerDto {
  @ApiProperty({ example: 'organiser@sporttech.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Priya' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ example: 'Sharma' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  lastName: string;
}
