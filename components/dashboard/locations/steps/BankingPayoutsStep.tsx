'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { LocationFormStep4 } from '@/types/merchant_locations'
import { X } from 'lucide-react'

interface BankingPayoutsStepProps {
    data: LocationFormStep4
    onChange: (data: Partial<LocationFormStep4>) => void
    errors?: Record<string, string>
    onBankSupportDocumentSelect?: (file: File | null) => void
    onClearBankSupportDocument?: () => void
}

function onlyDigits(value: string, maxLength: number): string {
    return value.replace(/\D/g, '').slice(0, maxLength)
}


export function BankingPayoutsStep({
    data,
    onChange,
    errors,
    onBankSupportDocumentSelect,
    onClearBankSupportDocument,
}: BankingPayoutsStepProps) {
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
                <Label>Bank Letter or Voided Check</Label>
                <div className="rounded-lg border p-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                        Upload the bank support document that HQ will review before approving online ordering for this branch.
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('bank-support-document-input')?.click()}
                        >
                            Choose File
                        </Button>
                        {data.bank_support_document_name ? (
                            <>
                                <span className="text-sm text-muted-foreground truncate">{data.bank_support_document_name}</span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-destructive hover:text-destructive"
                                    onClick={() => {
                                        onChange({
                                            bank_support_document_name: '',
                                            bank_support_document_url: '',
                                        })
                                        onClearBankSupportDocument?.()
                                    }}
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </>
                        ) : (
                            <span className="text-sm text-muted-foreground">No file selected</span>
                        )}
                    </div>
                    <input
                        id="bank-support-document-input"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0] || null
                            if (file) {
                                onChange({
                                    bank_support_document_name: file.name,
                                    bank_support_document_url: '',
                                })
                            }
                            onBankSupportDocumentSelect?.(file)
                        }}
                    />
                    {errors?.bank_support_document_name ? (
                        <p className="text-sm text-destructive">{errors.bank_support_document_name}</p>
                    ) : null}
                </div>
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

            <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">
                    Bank values entered here are UI-only at this stage. Backend save/tokenization wiring is intentionally paused.
                </p>
            </div>
        </div>
    )
}
