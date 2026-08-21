import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class RegisterDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsIn(['android', 'ios'])
  platform!: 'android' | 'ios';
}
