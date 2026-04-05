// ============================================================================
// Google Places Address Parser
// ----------------------------------------------------------------------------
// Converts a Google Maps GeocoderResult (or any result with address_components
// and geometry) into a flat ParsedAddress object for populating location forms.
// ============================================================================

export interface ParsedAddress {
  address_line1: string
  city: string
  state: string
  postal_code: string
  country: string
  latitude: number
  longitude: number
  place_id: string
}

// Minimal shape of the parts of a Google result we actually care about.
// Matches google.maps.GeocoderResult but kept structural so tests can pass
// fixtures without pulling in the global google types.
export interface GeocoderResultLike {
  place_id: string
  address_components: GeocoderAddressComponentLike[]
  geometry: {
    location: {
      lat: () => number
      lng: () => number
    } | {
      lat: number
      lng: number
    }
  }
}

export interface GeocoderAddressComponentLike {
  long_name: string
  short_name: string
  types: string[]
}

function findComponent(
  components: GeocoderAddressComponentLike[],
  type: string,
): GeocoderAddressComponentLike | undefined {
  return components.find((c) => c.types.includes(type))
}

function extractLatLng(
  geometry: GeocoderResultLike['geometry'],
): { latitude: number; longitude: number } {
  const loc = geometry.location as { lat: unknown; lng: unknown }
  const lat = typeof loc.lat === 'function' ? (loc.lat as () => number)() : (loc.lat as number)
  const lng = typeof loc.lng === 'function' ? (loc.lng as () => number)() : (loc.lng as number)
  return { latitude: lat, longitude: lng }
}

/**
 * Parse a Google Maps GeocoderResult into a flat ParsedAddress.
 *
 * Handles:
 *   - street_number + route → address_line1
 *   - postal_code + postal_code_suffix → "10001-1234"
 *   - city fallback chain: locality → sublocality → postal_town → administrative_area_level_2
 *   - state: administrative_area_level_1 (short_name, e.g. "NY")
 *   - country: short_name (e.g. "US")
 */
export function parseGooglePlaceResult(result: GeocoderResultLike): ParsedAddress {
  const components = result.address_components || []

  const streetNumber = findComponent(components, 'street_number')?.long_name ?? ''
  const route = findComponent(components, 'route')?.long_name ?? ''
  const address_line1 = [streetNumber, route].filter(Boolean).join(' ').trim()

  const cityComponent =
    findComponent(components, 'locality') ||
    findComponent(components, 'sublocality') ||
    findComponent(components, 'sublocality_level_1') ||
    findComponent(components, 'postal_town') ||
    findComponent(components, 'administrative_area_level_2')
  const city = cityComponent?.long_name ?? ''

  const stateComponent = findComponent(components, 'administrative_area_level_1')
  const state = stateComponent?.short_name ?? ''

  const postalComponent = findComponent(components, 'postal_code')
  const postalSuffixComponent = findComponent(components, 'postal_code_suffix')
  const postalBase = postalComponent?.long_name ?? ''
  const postalSuffix = postalSuffixComponent?.long_name ?? ''
  const postal_code = postalSuffix && postalBase ? `${postalBase}-${postalSuffix}` : postalBase

  const countryComponent = findComponent(components, 'country')
  const country = countryComponent?.short_name ?? ''

  const { latitude, longitude } = extractLatLng(result.geometry)

  return {
    address_line1,
    city,
    state,
    postal_code,
    country,
    latitude,
    longitude,
    place_id: result.place_id,
  }
}
