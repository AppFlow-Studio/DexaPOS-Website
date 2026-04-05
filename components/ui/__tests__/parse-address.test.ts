import { describe, it, expect } from 'vitest'
import {
  parseGooglePlaceResult,
  type GeocoderResultLike,
} from '@/lib/google/parse-address'

function makeResult(
  overrides: Partial<GeocoderResultLike>,
  lat = 40.7484,
  lng = -73.9857,
): GeocoderResultLike {
  return {
    place_id: overrides.place_id ?? 'place_test',
    address_components: overrides.address_components ?? [],
    geometry: overrides.geometry ?? {
      location: { lat: () => lat, lng: () => lng },
    },
  }
}

describe('parseGooglePlaceResult', () => {
  it('parses a standard US address', () => {
    const result = makeResult({
      place_id: 'place_1',
      address_components: [
        { long_name: '350', short_name: '350', types: ['street_number'] },
        { long_name: '5th Avenue', short_name: '5th Ave', types: ['route'] },
        { long_name: 'New York', short_name: 'New York', types: ['locality', 'political'] },
        { long_name: 'New York County', short_name: 'New York County', types: ['administrative_area_level_2', 'political'] },
        { long_name: 'New York', short_name: 'NY', types: ['administrative_area_level_1', 'political'] },
        { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
        { long_name: '10118', short_name: '10118', types: ['postal_code'] },
      ],
    })

    const parsed = parseGooglePlaceResult(result)

    expect(parsed.address_line1).toBe('350 5th Avenue')
    expect(parsed.city).toBe('New York')
    expect(parsed.state).toBe('NY')
    expect(parsed.postal_code).toBe('10118')
    expect(parsed.country).toBe('US')
    expect(parsed.latitude).toBe(40.7484)
    expect(parsed.longitude).toBe(-73.9857)
    expect(parsed.place_id).toBe('place_1')
  })

  it('combines postal_code + postal_code_suffix into ZIP+4', () => {
    const result = makeResult({
      address_components: [
        { long_name: '1600', short_name: '1600', types: ['street_number'] },
        { long_name: 'Amphitheatre Parkway', short_name: 'Amphitheatre Pkwy', types: ['route'] },
        { long_name: 'Mountain View', short_name: 'Mountain View', types: ['locality', 'political'] },
        { long_name: 'California', short_name: 'CA', types: ['administrative_area_level_1', 'political'] },
        { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
        { long_name: '94043', short_name: '94043', types: ['postal_code'] },
        { long_name: '1351', short_name: '1351', types: ['postal_code_suffix'] },
      ],
    })

    const parsed = parseGooglePlaceResult(result)

    expect(parsed.postal_code).toBe('94043-1351')
    expect(parsed.state).toBe('CA')
  })

  it('falls back to sublocality when locality is absent', () => {
    const result = makeResult({
      address_components: [
        { long_name: '123', short_name: '123', types: ['street_number'] },
        { long_name: 'Main Street', short_name: 'Main St', types: ['route'] },
        { long_name: 'Brooklyn', short_name: 'Brooklyn', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { long_name: 'Kings County', short_name: 'Kings County', types: ['administrative_area_level_2'] },
        { long_name: 'New York', short_name: 'NY', types: ['administrative_area_level_1', 'political'] },
        { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
        { long_name: '11201', short_name: '11201', types: ['postal_code'] },
      ],
    })

    const parsed = parseGooglePlaceResult(result)

    expect(parsed.city).toBe('Brooklyn')
    expect(parsed.state).toBe('NY')
  })

  it('handles missing street_number (returns just the route)', () => {
    const result = makeResult({
      address_components: [
        { long_name: 'Central Park West', short_name: 'Central Park W', types: ['route'] },
        { long_name: 'New York', short_name: 'New York', types: ['locality', 'political'] },
        { long_name: 'New York', short_name: 'NY', types: ['administrative_area_level_1', 'political'] },
        { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
        { long_name: '10024', short_name: '10024', types: ['postal_code'] },
      ],
    })

    const parsed = parseGooglePlaceResult(result)

    expect(parsed.address_line1).toBe('Central Park West')
    expect(parsed.city).toBe('New York')
  })

  it('reads lat/lng from plain-object geometry (non-function form)', () => {
    const result: GeocoderResultLike = {
      place_id: 'place_plain',
      address_components: [
        { long_name: '1', short_name: '1', types: ['street_number'] },
        { long_name: 'Infinite Loop', short_name: 'Infinite Loop', types: ['route'] },
        { long_name: 'Cupertino', short_name: 'Cupertino', types: ['locality'] },
        { long_name: 'California', short_name: 'CA', types: ['administrative_area_level_1'] },
        { long_name: 'United States', short_name: 'US', types: ['country'] },
        { long_name: '95014', short_name: '95014', types: ['postal_code'] },
      ],
      geometry: { location: { lat: 37.3318, lng: -122.0312 } },
    }

    const parsed = parseGooglePlaceResult(result)

    expect(parsed.latitude).toBe(37.3318)
    expect(parsed.longitude).toBe(-122.0312)
    expect(parsed.address_line1).toBe('1 Infinite Loop')
  })
})
