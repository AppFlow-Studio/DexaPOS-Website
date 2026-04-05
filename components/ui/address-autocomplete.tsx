'use client'

import * as React from 'react'
import { setOptions, importLibrary } from '@googlemaps/js-api-loader'
import { MapPin } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  parseGooglePlaceResult,
  type ParsedAddress,
  type GeocoderResultLike,
} from '@/lib/google/parse-address'

interface AddressAutocompleteProps {
  value: string
  onInputChange: (value: string) => void
  onAddressSelected: (parts: ParsedAddress) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
  id?: string
}

// Singleton loader so we only ever load the script once per page.
type LoadState = 'idle' | 'loading' | 'loaded' | 'failed'

let loaderPromise: Promise<void> | null = null
let loadState: LoadState = 'idle'
const loadSubscribers = new Set<(state: LoadState) => void>()

function notify(state: LoadState) {
  loadState = state
  for (const cb of loadSubscribers) cb(state)
}

function ensureGoogleMapsLoaded(): Promise<void> | null {
  if (loadState === 'loaded') return Promise.resolve()
  if (loaderPromise) return loaderPromise

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.warn(
      '[AddressAutocomplete] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set — falling back to a plain text input.',
    )
    notify('failed')
    return null
  }

  notify('loading')
  setOptions({ key: apiKey, v: 'weekly' })

  loaderPromise = importLibrary('places')
    .then(() => {
      notify('loaded')
    })
    .catch((err: unknown) => {
      console.warn('[AddressAutocomplete] Failed to load Google Maps script:', err)
      notify('failed')
      // Allow a future retry
      loaderPromise = null
      throw err
    })

  return loaderPromise
}

function useGoogleMapsLoadState(): LoadState {
  const [state, setState] = React.useState<LoadState>(loadState)

  React.useEffect(() => {
    loadSubscribers.add(setState)
    // Kick off load if not started
    if (loadState === 'idle') {
      ensureGoogleMapsLoaded()?.catch(() => {
        /* already handled via notify('failed') */
      })
    } else {
      // Sync in case state changed between render + subscribe
      setState(loadState)
    }
    return () => {
      loadSubscribers.delete(setState)
    }
  }, [])

  return state
}

export function AddressAutocomplete(props: AddressAutocompleteProps) {
  const state = useGoogleMapsLoadState()

  if (state === 'failed') {
    return <FallbackInput {...props} />
  }

  if (state !== 'loaded') {
    // Render a non-interactive mirror input while the script loads.
    // Users can still type; suggestions just won't appear yet.
    return <FallbackInput {...props} />
  }

  return <AddressAutocompleteInner {...props} />
}

function FallbackInput({
  value,
  onInputChange,
  placeholder,
  error,
  disabled,
  id,
}: AddressAutocompleteProps) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onInputChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(error && 'border-destructive')}
    />
  )
}

// Flattened shape of a Google Places prediction we care about in the UI.
type LocalSuggestion = {
  placeId: string
  text: string
  mainText: string
  secondaryText: string
  prediction: google.maps.places.PlacePrediction
}

function AddressAutocompleteInner({
  value,
  onInputChange,
  onAddressSelected,
  placeholder,
  error,
  disabled,
  id,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = React.useState<LocalSuggestion[]>([])
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)

  const sessionTokenRef = React.useRef<google.maps.places.AutocompleteSessionToken | null>(null)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic request id — ignore stale responses that resolve out of order.
  const requestIdRef = React.useRef(0)
  // Random name so browsers don't recognize this as an address field and
  // overlay their own autofill dropdown on top of our custom popover.
  const fieldNameRef = React.useRef(
    `address-search-${Math.random().toString(36).slice(2, 10)}`,
  )

  React.useEffect(() => {
    sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const fetchSuggestions = React.useCallback(async (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) {
      setSuggestions([])
      setOpen(false)
      return
    }

    const reqId = ++requestIdRef.current
    try {
      const { suggestions: results } =
        await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          includedRegionCodes: ['us'],
          sessionToken: sessionTokenRef.current ?? undefined,
        })
      if (reqId !== requestIdRef.current) return // stale

      const mapped: LocalSuggestion[] = results
        .filter((s): s is google.maps.places.AutocompleteSuggestion & { placePrediction: google.maps.places.PlacePrediction } =>
          s.placePrediction != null,
        )
        .map((s) => {
          const pp = s.placePrediction
          return {
            placeId: pp.placeId,
            text: pp.text?.text ?? '',
            mainText: pp.mainText?.text ?? '',
            secondaryText: pp.secondaryText?.text ?? '',
            prediction: pp,
          }
        })

      setSuggestions(mapped)
      setActiveIndex(0)
      setOpen(mapped.length > 0)
    } catch (err) {
      if (reqId !== requestIdRef.current) return
      console.warn('[AddressAutocomplete] fetchAutocompleteSuggestions failed:', err)
      setSuggestions([])
      setOpen(false)
    }
  }, [])

  const handleInputChange = (next: string) => {
    onInputChange(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(next)
    }, 300)
  }

  const handleSelect = React.useCallback(
    async (suggestion: LocalSuggestion) => {
      onInputChange(suggestion.text)
      setOpen(false)
      setSuggestions([])

      try {
        const place = suggestion.prediction.toPlace()
        await place.fetchFields({ fields: ['addressComponents', 'location'] })

        const components = (place.addressComponents ?? []).map((c) => ({
          long_name: c.longText ?? '',
          short_name: c.shortText ?? '',
          types: c.types ?? [],
        }))

        const loc = place.location
        const lat = loc ? loc.lat() : 0
        const lng = loc ? loc.lng() : 0

        const parsed = parseGooglePlaceResult({
          place_id: suggestion.placeId,
          address_components: components as unknown as GeocoderResultLike['address_components'],
          geometry: { location: { lat, lng } },
        })
        onAddressSelected(parsed)
      } catch (err) {
        console.warn('[AddressAutocomplete] place.fetchFields failed:', err)
      } finally {
        // Per Google's billing model, each session ends on fetchFields, so
        // roll over to a fresh token for the next search.
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken()
      }
    },
    [onAddressSelected, onInputChange],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const suggestion = suggestions[activeIndex]
      if (suggestion) handleSelect(suggestion)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        onBlur={() => {
          // Delay close so click handlers on items fire first.
          setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        // Aggressively disable browser + password manager autofill so their
        // native dropdown doesn't cover our custom suggestions list.
        autoComplete="off"
        name={fieldNameRef.current}
        data-form-type="other"
        data-1p-ignore="true"
        data-lpignore="true"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        className={cn(error && 'border-destructive')}
      />
      {open && suggestions.length > 0 && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
          // Prevent the input from blurring when clicking inside the dropdown.
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul className="max-h-[300px] overflow-y-auto p-1" role="listbox">
            {suggestions.map((suggestion, idx) => (
              <li
                key={suggestion.placeId}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleSelect(suggestion)}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
                  idx === activeIndex && 'bg-accent text-accent-foreground',
                )}
              >
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm">
                    {suggestion.mainText || suggestion.text}
                  </div>
                  {suggestion.secondaryText && (
                    <div className="truncate text-xs text-muted-foreground">
                      {suggestion.secondaryText}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
