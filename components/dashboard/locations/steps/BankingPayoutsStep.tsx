'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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


export function BankingPayoutsStep({
    data,
    onChange,
    errors,
}: BankingPayoutsStepProps) {
    return (
        <div className="space-y-6">
            {/* Borderless tinted row (§5.8), not a bordered box. */}
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-muted/45 p-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium">Use merchant billing ACH details</p>
                    <p className="text-xs text-muted-foreground max-sm:hidden">
                        UI is ready. Data copy wiring is intentionally deferred.
                    </p>
                </div>
                <Switch
                    checked={data.use_merchant_billing_profile}
                    onCheckedChange={(checked) => onChange({ use_merchant_billing_profile: checked })}
                    className="shrink-0"
                />
            </label>

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
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                    {/* Option cards: tinted, and the selected one gains a ring,
                        not a border (§5.8). */}
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-muted/45 p-4 transition-colors hover:bg-muted/70 has-[[data-state=checked]]:bg-muted has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-border">
                        <RadioGroupItem value="checking" />
                        <span className="text-sm font-medium">Checking</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-muted/45 p-4 transition-colors hover:bg-muted/70 has-[[data-state=checked]]:bg-muted has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-border">
                        <RadioGroupItem value="savings" />
                        <span className="text-sm font-medium">Savings</span>
                    </label>
                </RadioGroup>
            </div>

            {/* Neutral callout (§3.5); build-status notes stay off phones. */}
            <p className="rounded-2xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground max-sm:hidden">
                Bank values entered here are UI-only at this stage. Backend save/tokenization wiring is intentionally paused.
            </p>
        </div>
    )
}
