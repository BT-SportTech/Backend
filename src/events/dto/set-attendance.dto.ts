import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetAttendanceDto {
  @ApiProperty({
    example: true,
    description: 'true = mark present, false = clear attendance',
  })
  @IsBoolean()
  attended: boolean;
}
