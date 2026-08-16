import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  PlacesAutocompleteQueryDto,
  PlacesDetailsQueryDto,
} from './dto/places-query.dto';
import { PlacesService } from './places.service';

@ApiTags('places')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('autocomplete')
  @ApiOperation({
    summary: 'Search places (India) via Google Places Autocomplete',
  })
  autocomplete(@Query() query: PlacesAutocompleteQueryDto) {
    return this.placesService.autocomplete(query.q);
  }

  @Get('details')
  @ApiOperation({
    summary: 'Resolve place details (address components + lat/lng)',
  })
  details(@Query() query: PlacesDetailsQueryDto) {
    return this.placesService.details(query.placeId, query.sessionToken);
  }
}
