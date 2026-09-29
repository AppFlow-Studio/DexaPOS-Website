'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { Field, StatusItem, StatusWell, formatTimestamp } from './IntegrationPrimitives'
import type { PlatformValorSaasConfigSummary } from '@/app/manage/actions/platform-billing-config'
import {
  setPlatformValorSaasBillingCredentials,
  cutoverSubscriptionRailsToCentral,
} from '@/app/manage/actions/merchant-billing'

type CutoverResult = Awaited<ReturnType<typeof cutoverSubscriptionRailsToCentral>>

/** The per-item plan can run to hundreds of lines; the well shows the head. */
const DETAIL_LIMIT = 50

interface Props {
  config: PlatformValorSaasConfigSummary
  canEdit: boolean
}

/**
 * The central Dexa SaaS billing rail (Valor). One Panel, three sections: what
 * is saved, the credentials form, and the subscription-rail cutover.
 *
 * Status is words in a muted well (§3.5). The cutover's only colour is its
 * destructive button (§3.5, use 3).
 */
export function DexaSaasBillingValorRailCard({ config, canEdit }: Props) {
  const [isSaving, startSaving] = useTransition()
  const [isCutting, startCutover] = useTransition()

  const [epi, setEpi] = useState(config.epi ?? '')
  const [appid, setAppid] = useState(config.appid ?? '')
  const [appkey, setAppkey] = useState('')

  const [confirmed, setConfirmed] = useState(false)
  const [runningDry, setRunningDry] = useState(true)
  const [result, setResult] = useState<CutoverResult | null>(null)

  const missing = [!config.epi && 'EPI', !config.appKeyConfigured && 'app key'].filter(
    Boolean
  ) as string[]
  const status = !config.configured ? 'Not configured' : config.isActive ? 'Active' : 'Inactive'
  const statusNote = !config.configured
    ? `Needs ${missing.length ? `an ${missing.join(' and ')}` : 'saving'}`
    : config.isActive
      ? undefined
      : 'Subscriptions are not charged on this rail'

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault()
    startSaving(async () => {
      try {
        const res = await setPlatformValorSaasBillingCredentials({
          epi: epi.trim(),
          appid: appid.trim(),
          appkey: appkey.trim() || undefined,
        })
        if (!res.success) {
          toast.error(res.error ?? 'Failed to save the central SaaS billing credentials.')
          return
        }
        setAppkey('')
        toast.success('Central SaaS billing credentials saved.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save credentials.')
      }
    })
  }

  const runCutover = (dryRun: boolean) => {
    setRunningDry(dryRun)
    startCutover(async () => {
      try {
        const res = await cutoverSubscriptionRailsToCentral({ dryRun })
        setResult(res)
        if (!res.success) {
          toast.error(res.error ?? 'Cutover failed.')
          return
        }
        if (!dryRun) setConfirmed(false)
        toast.success(
          dryRun
            ? 'Dry run complete — no changes were made.'
            : `Cutover complete — ${res.railsMigrated} rail(s) migrated, ${res.cardsInvalidated} card(s) invalidated.`,
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Cutover failed.')
      }
    })
  }

  const cutoverBlocked = isCutting || !canEdit || !config.configured

  return (
    <Panel>
      <PanelSection
        label="Central SaaS billing (DEXA POS AI)"
        caption="The Dexa-owned Valor merchant that charges every merchant's SaaS subscription, so those fees settle to Dexa's bank. Each subscription rail clones these credentials; merchant online-ordering accounts are not changed here."
        /* Scope: which accounts this rail does and does not touch (§13.4). */
        showCaptionOnMobile
      >
        <StatusWell>
          <StatusItem term="Status" value={status} note={statusNote} />
          <StatusItem term="EPI" value={config.epi ?? 'Not set'} mono={Boolean(config.epi)} />
          <StatusItem term="App key" value={config.appKeyConfigured ? 'Saved' : 'Not set'} />
          <StatusItem
            term="Last updated"
            value={formatTimestamp(config.updatedAt, 'Never saved')}
          />
        </StatusWell>
      </PanelSection>

      <PanelSection
        label="Credentials"
        caption="The boarded DEXA POS AI EPI with its generated app id and app key. The app key is stored in Supabase Vault and is never shown again."
      >
        <form onSubmit={handleSave} className="grid gap-6 md:grid-cols-2">
          <Field
            id="valor-saas-epi"
            label="Valor EPI"
            hint="10 digits, starting with 2. On staging, use the sandbox EPI that can process recurring."
          >
            <Input
              id="valor-saas-epi"
              inputMode="numeric"
              className="tabular-nums"
              value={epi}
              onChange={(event) => setEpi(event.target.value)}
              placeholder="e.g. 2501496431"
              disabled={!canEdit}
            />
          </Field>

          <Field id="valor-saas-appid" label="Valor app ID">
            <Input
              id="valor-saas-appid"
              value={appid}
              onChange={(event) => setAppid(event.target.value)}
              placeholder="App id for this EPI"
              disabled={!canEdit}
            />
          </Field>

          <Field
            id="valor-saas-appkey"
            label="Valor app key"
            hint={config.appKeyConfigured ? 'Leave blank to keep the saved key.' : undefined}
          >
            <Input
              id="valor-saas-appkey"
              type="password"
              autoComplete="off"
              value={appkey}
              onChange={(event) => setAppkey(event.target.value)}
              placeholder={config.appKeyConfigured ? 'Saved — enter a new key to rotate' : 'App key'}
              disabled={!canEdit}
            />
          </Field>

          {/* Centred on a phone, right-aligned from `sm` up (create-organization). */}
          <div className="flex items-center justify-center sm:justify-end md:col-span-2">
            <Button type="submit" disabled={isSaving || !canEdit} className="w-full sm:w-auto">
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? 'Saving…' : 'Save central rail'}
            </Button>
          </div>
        </form>
      </PanelSection>

      <PanelSection
        label="Cut over subscription rails"
        caption="Moves every merchant's subscription rail onto the central credentials: deactivates native schedules on old EPIs, re-points each rail, and invalidates cards vaulted under an old EPI, so those merchants must re-add their card. Rails already on the central EPI are left untouched. Preview with a dry run first."
        /* It explains what the destructive button does — never trimmed (§13.4). */
        showCaptionOnMobile
      >
        <div className="space-y-5">
          {result && <CutoverResultWell result={result} />}

          <div className="flex items-start gap-3">
            <Checkbox
              id="valor-cutover-confirm"
              className="mt-0.5"
              checked={confirmed}
              disabled={!canEdit || !config.configured}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
            />
            <Label
              htmlFor="valor-cutover-confirm"
              className="text-sm font-normal leading-snug text-muted-foreground"
            >
              I understand this deactivates old native schedules and requires affected merchants to
              re-add their card.
            </Label>
          </div>

          {!config.configured && (
            <p className="text-sm text-muted-foreground">
              Save the central credentials before running a cutover.
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => runCutover(true)}
              disabled={cutoverBlocked}
            >
              {isCutting && runningDry && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Preview (dry run)
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => runCutover(false)}
              disabled={cutoverBlocked || !confirmed}
            >
              {isCutting && !runningDry && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run cutover
            </Button>
          </div>
        </div>
      </PanelSection>
    </Panel>
  )
}

function CutoverResultWell({ result }: { result: CutoverResult }) {
  const title = result.dryRun
    ? result.success
      ? 'Dry run — nothing changed'
      : 'Dry run failed — nothing changed'
    : result.success
      ? 'Cutover complete'
      : 'Cutover stopped part-way'
  const shown = result.details.slice(0, DETAIL_LIMIT)

  return (
    <div className="rounded-2xl bg-muted/60 px-4 py-4" aria-live="polite">
      <p className="text-sm font-medium">{title}</p>
      {result.error && <p className="mt-1 text-sm text-muted-foreground">{result.error}</p>}

      <dl className="mt-4 grid grid-cols-3 gap-x-6 gap-y-2">
        <Figure term={result.dryRun ? 'Rails to migrate' : 'Rails migrated'} value={result.railsMigrated} />
        <Figure
          term={result.dryRun ? 'Schedules to tear down' : 'Schedules torn down'}
          value={result.schedulesTornDown}
        />
        <Figure
          term={result.dryRun ? 'Cards to invalidate' : 'Cards invalidated'}
          value={result.cardsInvalidated}
        />
      </dl>

      {shown.length > 0 ? (
        <>
          <ul className="thin-scrollbar mt-4 max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {shown.map((detail, index) => (
              <li key={index} className="break-words">
                {detail.action}
                {detail.locationId && (
                  <span className="font-mono"> · loc {detail.locationId.slice(0, 8)}</span>
                )}
              </li>
            ))}
          </ul>
          {result.details.length > DETAIL_LIMIT && (
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              Showing the first {DETAIL_LIMIT} of {result.details.length} items.
            </p>
          )}
        </>
      ) : (
        result.success && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing to migrate — every rail is already on the central EPI.
          </p>
        )
      )}
    </div>
  )
}

function Figure({ term, value }: { term: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 text-xl font-medium tabular-nums">{value}</dd>
    </div>
  )
}
