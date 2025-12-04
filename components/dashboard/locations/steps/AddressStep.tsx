'use client'

import { useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LocationFormStep2, US_STATES, US_TIMEZONES } from '@/types/merchant_locations'

interface AddressStepProps {
    data: LocationFormStep2
    onChange: (data: Partial<LocationFormStep2>) => void
    errors?: Record<string, string>
}

// State to timezone mapping
const STATE_TIMEZONE_MAP: Record<string, string> = {
    // Eastern Time
    CT: 'America/New_York', DE: 'America/New_York', FL: 'America/New_York',
    GA: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
    MA: 'America/New_York', NH: 'America/New_York', NJ: 'America/New_York',
    NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York',
    PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York',
    VT: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York',
    DC: 'America/New_York', MI: 'America/New_York', IN: 'America/New_York',
    KY: 'America/New_York',

    // Central Time
    AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago',
    IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
    MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
    NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
    SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
    WI: 'America/Chicago',

    // Mountain Time
    CO: 'America/Denver', MT: 'America/Denver', NM: 'America/Denver',
    UT: 'America/Denver', WY: 'America/Denver', ID: 'America/Denver',

    // Arizona (no DST)
    AZ: 'America/Phoenix',

    // Pacific Time
    CA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
    OR: 'America/Los_Angeles', WA: 'America/Los_Angeles',

    // Alaska
    AK: 'America/Anchorage',

    // Hawaii
    HI: 'Pacific/Honolulu',
}

export function AddressStep({ data, onChange, errors }: AddressStepProps) {
    // Auto-select timezone when state changes
    useEffect(() => {
        if (data.state && STATE_TIMEZONE_MAP[data.state]) {
            const suggestedTimezone = STATE_TIMEZONE_MAP[data.state]
            if (data.timezone !== suggestedTimezone) {
                onChange({ timezone: suggestedTimezone })
            }
        }
    }, [data.state])

    const formatPostalCode = (value: string) => {
        // Remove all non-digits and dashes
        const cleaned = value.replace(/[^\d-]/g, '')

        // If it's just digits, auto-format
        const digits = cleaned.replace(/-/g, '')
        if (digits.length <= 5) {
            return digits
        } else if (digits.length <= 9) {
            return `${digits.slice(0, 5)}-${digits.slice(5)}`
        }
        return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="address_line1" className="text-primary">
                    Street address <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="address_line1"
                    value={data.address_line1}
                    onChange={(e) => onChange({ address_line1: e.target.value })}
                    placeholder="123 Main Street"
                    className={errors?.address_line1 ? 'border-destructive' : ''}
                />
                {errors?.address_line1 && (
                    <p className="text-sm text-destructive">{errors.address_line1}</p>
                )}
            </div>

            <div className="space-y-2">
                <Label htmlFor="address_line2">
                    Apartment, suite, etc.
                </Label>
                <Input
                    id="address_line2"
                    value={data.address_line2}
                    onChange={(e) => onChange({ address_line2: e.target.value })}
                    placeholder="Suite 100"
                />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="city" className="text-primary">
                        City <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="city"
                        value={data.city}
                        onChange={(e) => onChange({ city: e.target.value })}
                        placeholder="New York"
                        className={errors?.city ? 'border-destructive' : ''}
                    />
                    {errors?.city && (
                        <p className="text-sm text-destructive">{errors.city}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="state" className="text-primary">
                        State <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={data.state}
                        onValueChange={(value) => onChange({ state: value })}
                    >
                        <SelectTrigger className={errors?.state ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                            {US_STATES.map((state) => (
                                <SelectItem key={state.code} value={state.code}>
                                    {state.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors?.state && (
                        <p className="text-sm text-destructive">{errors.state}</p>
                    )}
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="postal_code" className="text-primary">
                        ZIP code <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="postal_code"
                        value={data.postal_code}
                        onChange={(e) => onChange({ postal_code: formatPostalCode(e.target.value) })}
                        placeholder="10001"
                        maxLength={10}
                        className={errors?.postal_code ? 'border-destructive' : ''}
                    />
                    {errors?.postal_code && (
                        <p className="text-sm text-destructive">{errors.postal_code}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        5 or 9 digit format (e.g., 10001 or 10001-1234)
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="timezone" className="text-primary">
                        Timezone <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={data.timezone}
                        onValueChange={(value) => onChange({ timezone: value })}
                    >
                        <SelectTrigger className={errors?.timezone ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                            {US_TIMEZONES.map((tz) => (
                                <SelectItem key={tz.value} value={tz.value}>
                                    {tz.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors?.timezone && (
                        <p className="text-sm text-destructive">{errors.timezone}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Auto-selected based on state
                    </p>
                </div>
            </div>
        </div>
    )
}

