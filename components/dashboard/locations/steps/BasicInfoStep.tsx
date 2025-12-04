'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LocationFormStep1 } from '@/types/merchant_locations'

interface BasicInfoStepProps {
    data: LocationFormStep1
    onChange: (data: Partial<LocationFormStep1>) => void
    errors?: Record<string, string>
}

export function BasicInfoStep({ data, onChange, errors }: BasicInfoStepProps) {
    const generateCodeFromName = (name: string) => {
        return name
            .toUpperCase()
            .replace(/[^A-Z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .slice(0, 20)
    }

    const handleNameChange = (name: string) => {
        onChange({ name })
        // Auto-generate code if it's empty or was auto-generated
        if (!data.code || data.code === generateCodeFromName(data.name)) {
            onChange({ name, code: generateCodeFromName(name) })
        } else {
            onChange({ name })
        }
    }

    const formatPhoneNumber = (value: string) => {
        // Remove all non-digits
        const digits = value.replace(/\D/g, '')

        // Format as (XXX) XXX-XXXX
        if (digits.length <= 3) {
            return digits
        } else if (digits.length <= 6) {
            return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
        } else {
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`
        }
    }

    const handlePhoneChange = (value: string) => {
        const formatted = formatPhoneNumber(value)
        onChange({ phone: formatted })
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label htmlFor="name" className="text-primary">
                    Location name <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="name"
                    value={data.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Downtown Branch"
                    className={errors?.name ? 'border-destructive' : ''}
                />
                {errors?.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                )}
                <p className="text-xs text-muted-foreground">
                    This is how your location will appear to customers
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="code">
                    Location code
                </Label>
                <Input
                    id="code"
                    value={data.code}
                    onChange={(e) => onChange({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9\-]/g, '') })}
                    placeholder="DOWNTOWN-01"
                    className={errors?.code ? 'border-destructive' : ''}
                    maxLength={20}
                />
                {errors?.code && (
                    <p className="text-sm text-destructive">{errors.code}</p>
                )}
                <p className="text-xs text-muted-foreground">
                    Optional short identifier (e.g., NYC-01, LA-MAIN)
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="phone">
                        Phone number
                    </Label>
                    <Input
                        id="phone"
                        type="tel"
                        value={data.phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        placeholder="(555) 123-4567"
                        className={errors?.phone ? 'border-destructive' : ''}
                    />
                    {errors?.phone && (
                        <p className="text-sm text-destructive">{errors.phone}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email">
                        Email address
                    </Label>
                    <Input
                        id="email"
                        type="email"
                        value={data.email}
                        onChange={(e) => onChange({ email: e.target.value })}
                        placeholder="location@example.com"
                        className={errors?.email ? 'border-destructive' : ''}
                    />
                    {errors?.email && (
                        <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                </div>
            </div>
        </div>
    )
}

