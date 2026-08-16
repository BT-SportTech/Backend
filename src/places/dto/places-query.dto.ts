import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class PlacesAutocompleteQueryDto {
  @ApiProperty({ example: 'Jubilee Hills Hyderabad', minLength: 2 })
  @IsString()
  @MinLength(2)
  q!: string;
}

export class PlacesDetailsQueryDto {
  @ApiProperty({ example: 'ChIJ...' })
  @IsString()
  @IsNotEmpty()
  placeId!: string;

  @ApiPropertyOptional({
    description: 'Optional Places session token to bill autocomplete + details together',
  })
  @IsOptional()
  @IsString()
  sessionToken?: string;
}
