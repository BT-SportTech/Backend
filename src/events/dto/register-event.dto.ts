import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterEventDto {
  @ApiPropertyOptional({
    example: 'MOCK-ABC123',
    description: 'Payment or receipt reference from checkout',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentRef?: string;

  @ApiPropertyOptional({
    example: 'UPI',
    description: 'Payment method: UPI, CARD, NET_BANKING, FREE',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paymentMethod?: string;
}
