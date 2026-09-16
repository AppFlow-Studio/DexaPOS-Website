'use client'

import { useMemo, useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useSaveMerchantAcquirerProfile } from '@/lib/queries/use-admin-valor-boarding'
import { revealAcquirerMid } from '@/app/manage/actions/admin-merchant/valor-acquirer'
import type {
  AcquirerProfileMasked,
  MerchantAcquirerProfile,
} from '@/app/manage/actions/admin-merchant/valor-acquirer'

/** One scope's editable identifiers. */
interface ScopeValues {
  mid: string
  vnumber: string
  storeNo: string
  termNo: string
}

const EMPTY: ScopeValues = { mid: '', vnumber: '', storeNo: '', termNo: '' }

function isComplete(v: ScopeValues): boolean {
  return (
    v.mid.trim() !== '' &&
    v.vnumber.trim() !== '' &&
    v.storeNo.trim() !== '' &&
    v.termNo.trim() !== ''
  )
}

export function AcquirerProfileSheet({
  merchantId,
  profile,
  open,
  onOpenChange,
}: {
  merchantId: string
  profile: MerchantAcquirerProfile
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Processing credentials</SheetTitle>
          <SheetDescription>
            Entered from the acquirer at underwriting. Each MID routes settlement to the
            merchant’s own bank account. Stored encrypted; HQ-only.
          </SheetDescription>
        </SheetHeader>
        {/* Remount on each open so the form re-seeds from the latest profile without
            a reset effect (initial state comes from useState initializers below). */}
        <AcquirerForm
          key={open ? 'open' : 'closed'}
          merchantId={merchantId}
          profile={profile}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

/** Seed a scope's editable values from its masked profile (store/term only). */
function seedScope(masked: AcquirerProfileMasked | null): ScopeValues {
  return masked ? { ...EMPTY, storeNo: masked.storeNo, termNo: masked.termNo } : EMPTY
}

function AcquirerForm({
  merchantId,
  profile,
  onClose,
}: {
  merchantId: string
  profile: MerchantAcquirerProfile
  onClose: () => void
}) {
  const save = useSaveMerchantAcquirerProfile(merchantId)
  const multiLocation = profile.locations.length > 1

  const [sameForAll, setSameForAll] = useState(() => profile.mode !== 'per_location')
  const [shared, setShared] = useState<ScopeValues>(() => seedScope(profile.shared))
  const [perLoc, setPerLoc] = useState<Record<string, ScopeValues>>(() => {
    const seeded: Record<string, ScopeValues> = {}
    for (const loc of profile.locations) {
      seeded[loc.locationId] = seedScope(
        profile.perLocation.find((p) => p.locationId === loc.locationId) ?? null,
      )
    }
    return seeded
  })

  const canSave = useMemo(() => {
    if (sameForAll) return isComplete(shared)
    return (
      profile.locations.length > 0 &&
      profile.locations.every((l) => isComplete(perLoc[l.locationId] ?? EMPTY))
    )
  }, [sameForAll, shared, perLoc, profile.locations])

  const handleSave = () => {
    save.mutate(
      sameForAll
        ? { sameForAll: true, shared }
        : {
            sameForAll: false,
            perLocation: profile.locations.map((l) => ({
              locationId: l.locationId,
              ...(perLoc[l.locationId] ?? EMPTY),
            })),
          },
      {
        onSuccess: (result) => {
          if (result.ok) {
            toast.success('Processing credentials saved')
            onClose()
          } else {
            toast.error('Could not save', { description: result.error ?? 'Unknown error.' })
          }
        },
        onError: (e) =>
          toast.error('Could not save', {
            description: e instanceof Error ? e.message : 'Unknown error.',
          }),
      },
    )
  }

  return (
    <>
      <div className="space-y-6 px-4 py-2">
          {multiLocation && (
            <label className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Use the same MID for all locations</div>
                <div className="text-xs text-muted-foreground">
                  Turn off to enter a distinct MID per location.
                </div>
              </div>
              <Switch checked={sameForAll} onCheckedChange={setSameForAll} />
            </label>
          )}

          {sameForAll ? (
            <ScopeFields
              merchantId={merchantId}
              locationId={null}
              masked={profile.shared}
              values={shared}
              onChange={setShared}
            />
          ) : (
            <div className="space-y-3">
              {profile.locations.map((loc) => (
                <ScopeFields
                  key={loc.locationId}
                  merchantId={merchantId}
                  locationId={loc.locationId}
                  title={loc.locationName}
                  masked={
                    profile.perLocation.find((p) => p.locationId === loc.locationId) ?? null
                  }
                  values={perLoc[loc.locationId] ?? EMPTY}
                  onChange={(v) =>
                    setPerLoc((prev) => ({ ...prev, [loc.locationId]: v }))
                  }
                />
              ))}
            </div>
          )}

          <Collapsible>
            <CollapsibleTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground">
              ▸ Acquiring program (BIN, agent, processor…)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              BIN, agent, agent bank, processor and program type are configured once at the
              ISO level (the DEXAPOS ISV / Mtech ISO) and applied automatically to every
              boarded account. Only the fields above are per-merchant.
            </CollapsibleContent>
          </Collapsible>
      </div>

      <SheetFooter>
        <Button variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!canSave || save.isPending}>
          {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save
        </Button>
      </SheetFooter>
    </>
  )
}

/** One editable scope (shared or a single location). */
function ScopeFields({
  merchantId,
  locationId,
  title,
  masked,
  values,
  onChange,
}: {
  merchantId: string
  locationId: string | null
  title?: string
  masked: AcquirerProfileMasked | null
  values: ScopeValues
  onChange: (v: ScopeValues) => void
}) {
  const [showMid, setShowMid] = useState(false)
  const [showVnum, setShowVnum] = useState(false)
  const [revealing, setRevealing] = useState(false)

  const set = (patch: Partial<ScopeValues>) => onChange({ ...values, ...patch })

  const handleReveal = async () => {
    setRevealing(true)
    try {
      const res = await revealAcquirerMid(merchantId, locationId)
      if (res.ok) {
        set({ mid: res.mid ?? values.mid, vnumber: res.vnumber ?? values.vnumber })
        setShowMid(true)
        setShowVnum(true)
      } else {
        toast.error('Could not reveal', { description: res.error })
      }
    } finally {
      setRevealing(false)
    }
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title ?? 'Merchant identifiers'}
        </div>
        {masked && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={handleReveal}
            disabled={revealing}
          >
            {revealing ? 'Revealing…' : `Reveal current (····${masked.midLast4})`}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SecretField
          label="MID"
          value={values.mid}
          show={showMid}
          onToggle={() => setShowMid((s) => !s)}
          onChange={(v) => set({ mid: v })}
          placeholder={masked ? `····${masked.midLast4}` : '887000003193'}
        />
        <SecretField
          label="V-Number"
          value={values.vnumber}
          show={showVnum}
          onToggle={() => setShowVnum((s) => !s)}
          onChange={(v) => set({ vnumber: v })}
          placeholder={masked?.vnumberLast4 ? `····${masked.vnumberLast4}` : '75021674'}
        />
        <PlainField
          label="Store #"
          value={values.storeNo}
          onChange={(v) => set({ storeNo: v })}
          placeholder="5999"
        />
        <PlainField
          label="Terminal #"
          value={values.termNo}
          onChange={(v) => set({ termNo: v })}
          placeholder="1515"
        />
      </div>
    </div>
  )
}

function SecretField({
  label,
  value,
  show,
  onToggle,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  show: boolean
  onToggle: () => void
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label} *</Label>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-9"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
          aria-pressed={show}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function PlainField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label} *</Label>
      <Input
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
