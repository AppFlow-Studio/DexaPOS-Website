'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Sparkles, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { useAdminCreateNmiMerchant, type AdminCreateNmiMerchantInput, type OnlineOrderingSettings } from '@/lib/queries/use-admin-online-ordering'
import type { Location } from '@/types/merchant_locations'

interface NmiCreateMerchantDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  merchantName: string
  locationId: string
  location: Location | undefined
  settings: Partial<OnlineOrderingSettings> | undefined
  partnerPortalUrl: string
}

type FormState = Omit<AdminCreateNmiMerchantInput, 'merchantId' | 'locationId'>

function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

function splitFullName(name: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function buildDefaults(args: {
  merchantName: string
  location: Location | undefined
  settings: Partial<OnlineOrderingSettings> | undefined
}): FormState {
  const { merchantName, location, settings } = args
  const merchantPacket = settings?.merchantReviewPacket
  const locationPacket = settings?.locationReviewPacket
  const owner = splitFullName(merchantPacket?.ownerFullName ?? null)

  const company = merchantPacket?.legalBusinessName || merchantPacket?.dbaName || merchantName || ''
  const address1 = (location as any)?.address_line1 || (location as any)?.address || settings?.address || ''
  const city = (location as any)?.city || ''
  const state = (location as any)?.state || ''
  const zip = (location as any)?.postal_code || (location as any)?.zip || ''
  const timezone = (location as any)?.timezone || 'America/New_York'
  const phone = settings?.phone || (location as any)?.phone || ''
  const email = settings?.email || (location as any)?.email || ''

  const usernameSeed = (location?.name || merchantName || 'merchant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16) || 'merchant'

  return {
    company,
    externalIdentifier: '',
    country: 'US',
    address1,
    address2: '',
    city,
    state,
    zip,
    url: '',
    timezone,
    firstName: owner.firstName,
    lastName: owner.lastName,
    email,
    phone,
    fax: '',
    language: 'en_US',
    username: `${usernameSeed}_${Date.now().toString().slice(-4)}`,
    checkAccount: digitsOnly(locationPacket?.ddaAccountNumber),
    checkAba: digitsOnly(locationPacket?.routingNumber),
    accountHolderType: 'business',
    accountType: 'checking',
  }
}

export function NmiCreateMerchantDialog({
  open,
  onOpenChange,
  merchantId,
  merchantName,
  locationId,
  location,
  settings,
  partnerPortalUrl,
}: NmiCreateMerchantDialogProps) {
  const defaults = useMemo(
    () => buildDefaults({ merchantName, location, settings }),
    [merchantName, location, settings]
  )
  const [form, setForm] = useState<FormState>(defaults)
  const createMutation = useAdminCreateNmiMerchant()

  // Re-prefill when the dialog opens or the source data changes.
  useEffect(() => {
    if (open) setForm(defaults)
  }, [open, defaults])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const requiredMissing =
    !form.company ||
    !form.address1 ||
    !form.city ||
    !form.state ||
    !form.zip ||
    !form.firstName ||
    !form.lastName ||
    !form.email ||
    !form.phone ||
    !form.username ||
    !form.checkAccount ||
    !form.checkAba

  const handleSubmit = async () => {
    if (!locationId) {
      toast.error('Pick a location before creating the NMI account.')
      return
    }
    const result = await createMutation.mutateAsync({
      merchantId,
      locationId,
      ...form,
    })
    if (result.success && result.data) {
      toast.success(`NMI merchant created (id ${result.data.nmiMerchantId})`)
      onOpenChange(false)
    } else {
      toast.error(result.error || 'Failed to create NMI merchant')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Create NMI Merchant Account
          </DialogTitle>
          <DialogDescription>
            We pre-filled this form from the merchant&apos;s review packet. Review the fields,
            then confirm to create a sandbox gateway account in NMI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section className="space-y-3">
            <h4 className="text-sm font-medium">Business</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input value={form.company} onChange={(e) => update('company', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>External Identifier</Label>
                <Input
                  value={form.externalIdentifier ?? ''}
                  onChange={(e) => update('externalIdentifier', e.target.value)}
                  placeholder="Defaults to merchant id"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address line 1</Label>
                <Input value={form.address1} onChange={(e) => update('address1', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address line 2</Label>
                <Input value={form.address2 ?? ''} onChange={(e) => update('address2', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => update('city', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>State (2-letter)</Label>
                <Input value={form.state} maxLength={2} onChange={(e) => update('state', e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>ZIP</Label>
                <Input value={form.zip} onChange={(e) => update('zip', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Country</Label>
                <Input value={form.country} maxLength={2} onChange={(e) => update('country', e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Input value={form.timezone} onChange={(e) => update('timezone', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Website</Label>
                <Input value={form.url ?? ''} onChange={(e) => update('url', e.target.value)} />
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h4 className="text-sm font-medium">Primary Contact</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fax</Label>
                <Input value={form.fax ?? ''} onChange={(e) => update('fax', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Language</Label>
                <Input value={form.language} onChange={(e) => update('language', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>NMI portal username (will be created)</Label>
                <Input value={form.username} onChange={(e) => update('username', e.target.value)} />
              </div>
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h4 className="text-sm font-medium">Banking (used by NMI for billing the merchant)</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Routing / ABA</Label>
                <Input value={form.checkAba} onChange={(e) => update('checkAba', digitsOnly(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Account number</Label>
                <Input value={form.checkAccount} onChange={(e) => update('checkAccount', digitsOnly(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>Account holder type</Label>
                <Select
                  value={form.accountHolderType}
                  onValueChange={(v) => update('accountHolderType', v as FormState['accountHolderType'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Account type</Label>
                <Select
                  value={form.accountType}
                  onValueChange={(v) => update('accountType', v as FormState['accountType'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Checking</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" asChild>
            <a href={partnerPortalUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Open NMI partner portal
            </a>
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={requiredMissing || createMutation.isPending}>
              {createMutation.isPending ? (
                <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Creating…</>
              ) : (
                'Confirm & create'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
