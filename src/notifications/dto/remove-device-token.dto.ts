import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveDeviceTokenDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}
