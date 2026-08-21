import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterEventDto {
  @ApiPropertyOptional({
    deprecated: true,
    description: 'Ignored for paid events; use Razorpay fields instead',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentRef?: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Ignored for paid events; use Razorpay fields instead',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  paymentMethod?: string;

  @ApiPropertyOptional({
    example: 'order_Nxxxxxxxxxxxxxxx',
    description: 'Razorpay order ID from checkout',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  razorpayOrderId?: string;

  @ApiPropertyOptional({
    example: 'pay_Nxxxxxxxxxxxxxxx',
    description: 'Razorpay payment ID after successful checkout',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  razorpayPaymentId?: string;

  @ApiPropertyOptional({
    description: 'Razorpay payment signature for server verification',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  razorpaySignature?: string;
}
