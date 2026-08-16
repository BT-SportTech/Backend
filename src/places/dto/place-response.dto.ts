import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlaceSuggestionDto {
  @ApiProperty()
  placeId!: string;

  @ApiProperty()
  primaryText!: string;

  @ApiPropertyOptional()
  secondaryText?: string;

  @ApiProperty()
  fullText!: string;
}

export class PlaceDetailsDto {
  @ApiProperty()
  placeId!: string;

  @ApiPropertyOptional()
  formattedAddress?: string;

  @ApiPropertyOptional()
  city?: string;

  @ApiPropertyOptional()
  district?: string;

  @ApiPropertyOptional()
  state?: string;

  @ApiPropertyOptional()
  pincode?: string;

  @ApiPropertyOptional()
  latitude?: number;

  @ApiPropertyOptional()
  longitude?: number;
}
