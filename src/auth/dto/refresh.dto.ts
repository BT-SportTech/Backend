import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6...',
    description: 'Refresh token returned from login or register',
  })
  @IsString()
  refreshToken: string;
}
