'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { LocationFormStep4 } from '@/types/merchant_locations'

interface BankingPayoutsStepProps {
    data: LocationFormStep4
    onChange: (data: Partial<LocationFormStep4>) => void
    errors?: Record<string, string>
}

function onlyDigits(value: string, maxLength: number): string {
    return value.replace(/\D/g, '').slice(0, maxLength)
}

function formatCurrencyInput(value: string): string {
    const cleaned = value.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    if (parts.length === 1) return parts[0]
    return `${parts[0]}.${(parts[1] ?? '').slice(0, 2)}`
}

const dayOfWeekOptions = [
    { value: '0', label: 'Sunday' },
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
]

export function BankingPayoutsStep({ data, onChange, errors }: BankingPayoutsStepProps) {
    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                        <p className="text-sm font-medium">Use merchant billing ACH details</p>
                        <p className="text-xs text-muted-foreground">
                            UI is ready. Data copy wiring is intentionally deferred.
                        </p>
                    </div>
                    <Switch
                        checked={data.use_merchant_billing_profile}
                        onCheckedChange={(checked) => onChange({ use_merchant_billing_profile: checked })}
                    />
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank Name</Label>
                    <Input
                        id="bank_name"
                        value={data.bank_name}
                        onChange={(event) => onChange({ bank_name: event.target.value })}
                        placeholder="Chase Bank"
                        className={errors?.bank_name ? 'border-destructive' : ''}
                    />
                    {errors?.bank_name && <p className="text-sm text-destructive">{errors.bank_name}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="account_holder_name">Account Holder Name</Label>
                    <Input
                        id="account_holder_name"
                        value={data.account_holder_name}
                        onChange={(event) => onChange({ account_holder_name: event.target.value })}
                        placeholder="Joe's Coffee LLC"
                        className={errors?.account_holder_name ? 'border-destructive' : ''}
                    />
                    {errors?.account_holder_name && <p className="text-sm text-destructive">{errors.account_holder_name}</p>}
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <Label htmlFor="routing_number">Routing Number</Label>
                    <Input
                        id="routing_number"
                        value={data.routing_number}
                        onChange={(event) => onChange({ routing_number: onlyDigits(event.target.value, 9) })}
                        placeholder="123456789"
                        className={errors?.routing_number ? 'border-destructive' : ''}
                        maxLength={9}
                    />
                    {errors?.routing_number && <p className="text-sm text-destructive">{errors.routing_number}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="account_number">Account Number</Label>
                    <Input
                        id="account_number"
                        value={data.account_number}
                        onChange={(event) => onChange({ account_number: onlyDigits(event.target.value, 17) })}
                        placeholder="Account number"
                        className={errors?.account_number ? 'border-destructive' : ''}
                        maxLength={17}
                    />
                    {errors?.account_number && <p className="text-sm text-destructive">{errors.account_number}</p>}
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="confirm_account_number">Confirm Account Number</Label>
                <Input
                    id="confirm_account_number"
                    value={data.confirm_account_number}
                    onChange={(event) => onChange({ confirm_account_number: onlyDigits(event.target.value, 17) })}
                    placeholder="Re-enter account number"
                    className={errors?.confirm_account_number ? 'border-destructive' : ''}
                    maxLength={17}
                />
                {errors?.confirm_account_number && <p className="text-sm text-destructive">{errors.confirm_account_number}</p>}
            </div>

            <div className="space-y-2">
                <Label>Account Type</Label>
                <RadioGroup
                    value={data.account_type}
                    onValueChange={(value: 'checking' | 'savings') => onChange({ account_type: value })}
                    className="grid grid-cols-2 gap-3"
                >
                    <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
                        <RadioGroupItem value="checking" />
                        <span className="text-sm font-medium">Checking</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer">
                        <RadioGroupItem value="savings" />
                        <span className="text-sm font-medium">Savings</span>
                    </label>
                </RadioGroup>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                    <Label>Payout Frequency</Label>
                    <Select
                        value={data.payout_frequency}
                        onValueChange={(value: 'daily' | 'weekly' | 'monthly') => onChange({ payout_frequency: value })}
                    >
                        <SelectTrigger className={errors?.payout_frequency ? 'border-destructive' : ''}>
                            <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="daily">Daily</SelectItem>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                    </Select>
                    {errors?.payout_frequency && <p className="text-sm text-destructive">{errors.payout_frequency}</p>}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="minimum_payout_amount">Minimum Payout Amount</Label>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <Input
                            id="minimum_payout_amount"
                            value={data.minimum_payout_amount}
                            onChange={(event) => onChange({ minimum_payout_amount: formatCurrencyInput(event.target.value) })}
                            placeholder="0.00"
                            className={errors?.minimum_payout_amount ? 'border-destructive pl-7' : 'pl-7'}
                        />
                    </div>
                    {errors?.minimum_payout_amount && <p className="text-sm text-destructive">{errors.minimum_payout_amount}</p>}
                </div>
            </div>

            {data.payout_frequency === 'weekly' && (
                <div className="space-y-2">
                    <Label>Weekly Payout Day</Label>
                    <Select
                        value={data.payout_day_of_week}
                        onValueChange={(value) => onChange({ payout_day_of_week: value })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select day" />
                        </SelectTrigger>
                        <SelectContent>
                            {dayOfWeekOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            {data.payout_frequency === 'monthly' && (
                <div className="space-y-2">
                    <Label>Monthly Payout Day</Label>
                    <Select
                        value={data.payout_day_of_month}
                        onValueChange={(value) => onChange({ payout_day_of_month: value })}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Select day of month" />
                        </SelectTrigger>
                        <SelectContent>
                            {Array.from({ length: 28 }, (_, index) => {
                                const day = String(index + 1)
                                return (
                                    <SelectItem key={day} value={day}>
                                        Day {day}
                                    </SelectItem>
                                )
                            })}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">
                    Bank values entered here are UI-only at this stage. Backend save/tokenization wiring is intentionally paused.
                </p>
            </div>
        </div>
    )
}
