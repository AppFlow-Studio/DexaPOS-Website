'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LocationFormStep3 } from '@/types/merchant_locations'

interface TaxComplianceStepProps {
    data: LocationFormStep3
    onChange: (data: Partial<LocationFormStep3>) => void
    errors?: Record<string, string>
}

function formatEin(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 9)
    if (digits.length <= 2) return digits
    return `${digits.slice(0, 2)}-${digits.slice(2)}`
}

function formatSalesTaxRate(value: string): string {
    const cleaned = value.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    const whole = parts[0] ?? ''
    const decimal = parts[1] ?? ''
    if (parts.length === 1) return whole
    return `${whole}.${decimal.slice(0, 4)}`
}

export function TaxComplianceStep({ data, onChange, errors }: TaxComplianceStepProps) {
    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Add tax details for this location. This will be shown in onboarding review and later settings.
            </p>

            <div className="space-y-2">
                <Label htmlFor="ein" className="text-primary">
                    EIN <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="ein"
                    value={data.ein}
                    onChange={(event) => onChange({ ein: formatEin(event.target.value) })}
                    placeholder="12-3456789"
                    className={errors?.ein ? 'border-destructive' : ''}
                    maxLength={10}
                />
                {errors?.ein && (
                    <p className="text-sm text-destructive">{errors.ein}</p>
                )}
                <p className="text-xs text-muted-foreground">
                    Format: 2 digits, dash, 7 digits.
                </p>
            </div>

            <div className="space-y-2">
                <Label htmlFor="tax_id">State Tax ID (optional)</Label>
                <Input
                    id="tax_id"
                    value={data.tax_id}
                    onChange={(event) => onChange({ tax_id: event.target.value })}
                    placeholder="NY-12345678"
                    className={errors?.tax_id ? 'border-destructive' : ''}
                />
                {errors?.tax_id && (
                    <p className="text-sm text-destructive">{errors.tax_id}</p>
                )}
            </div>

            <div className="space-y-2">
                <Label htmlFor="sales_tax_rate" className="text-primary">
                    Sales Tax Rate (%) <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                    <Input
                        id="sales_tax_rate"
                        value={data.sales_tax_rate}
                        onChange={(event) => onChange({ sales_tax_rate: formatSalesTaxRate(event.target.value) })}
                        placeholder="8.75"
                        className={errors?.sales_tax_rate ? 'border-destructive pr-8' : 'pr-8'}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        %
                    </span>
                </div>
                {errors?.sales_tax_rate && (
                    <p className="text-sm text-destructive">{errors.sales_tax_rate}</p>
                )}
            </div>
        </div>
    )
}
