import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PlaceDetailsDto,
  PlaceSuggestionDto,
} from './dto/place-response.dto';

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlaceDetails = {
  id?: string;
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: { latitude?: number; longitude?: number };
};

type GoogleAutocompleteSuggestion = {
  placePrediction?: {
    placeId?: string;
    place?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

@Injectable()
export class PlacesService {
  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string {
    const key = this.config.get<string>('GOOGLE_PLACES_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'Google Places is not configured. Set GOOGLE_PLACES_API_KEY.',
      );
    }
    return key;
  }

  async autocomplete(query: string): Promise<{ suggestions: PlaceSuggestionDto[] }> {
    const input = query.trim();
    if (input.length < 2) {
      return { suggestions: [] };
    }

    const res = await fetch(
      'https://places.googleapis.com/v1/places:autocomplete',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ['IN'],
          languageCode: 'en',
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadGatewayException(
        `Places autocomplete failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
      );
    }

    const data = (await res.json()) as {
      suggestions?: GoogleAutocompleteSuggestion[];
    };

    const suggestions = (data.suggestions ?? [])
      .map((item) => this.mapSuggestion(item))
      .filter((s): s is PlaceSuggestionDto => s != null);

    return { suggestions };
  }

  async details(
    placeId: string,
    sessionToken?: string,
  ): Promise<PlaceDetailsDto> {
    const id = this.normalizePlaceId(placeId);
    const url = new URL(`https://places.googleapis.com/v1/places/${id}`);
    if (sessionToken?.trim()) {
      url.searchParams.set('sessionToken', sessionToken.trim());
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask':
          'id,formattedAddress,addressComponents,location',
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadGatewayException(
        `Places details failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
      );
    }

    const place = (await res.json()) as GooglePlaceDetails;
    return this.mapDetails(place, id);
  }

  private mapSuggestion(
    item: GoogleAutocompleteSuggestion,
  ): PlaceSuggestionDto | null {
    const prediction = item.placePrediction;
    if (!prediction) return null;

    const placeId =
      prediction.placeId?.trim() ||
      this.normalizePlaceId(prediction.place ?? '');
    if (!placeId) return null;

    const fullText = prediction.text?.text?.trim() || '';
    const primaryText =
      prediction.structuredFormat?.mainText?.text?.trim() || fullText;
    const secondaryText =
      prediction.structuredFormat?.secondaryText?.text?.trim() || undefined;

    if (!primaryText && !fullText) return null;

    return {
      placeId,
      primaryText: primaryText || fullText,
      secondaryText,
      fullText: fullText || primaryText,
    };
  }

  private mapDetails(place: GooglePlaceDetails, fallbackId: string): PlaceDetailsDto {
    const components = place.addressComponents ?? [];
    const byType = (type: string) =>
      components.find((c) => c.types?.includes(type))?.longText?.trim();

    const city =
      byType('locality') ||
      byType('postal_town') ||
      byType('sublocality_level_1') ||
      byType('sublocality');

    const district =
      byType('administrative_area_level_2') ||
      byType('administrative_area_level_3') ||
      byType('administrative_area_level_4');

    const state = byType('administrative_area_level_1');
    const pincode = byType('postal_code');

    return {
      placeId: this.normalizePlaceId(place.id ?? fallbackId),
      formattedAddress: place.formattedAddress?.trim() || undefined,
      city: city || undefined,
      district: district || undefined,
      state: state || undefined,
      pincode: pincode || undefined,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
    };
  }

  /** Accepts `ChIJ...` or `places/ChIJ...`. */
  private normalizePlaceId(raw: string): string {
    const value = raw.trim();
    if (!value) return '';
    return value.startsWith('places/') ? value.slice('places/'.length) : value;
  }
}
