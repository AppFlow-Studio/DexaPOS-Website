'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, KeyRound, Landmark, RefreshCw, Shield } from 'lucide-react'
import type { PlatformValorSaasConfigSummary } from '@/app/manage/actions/platform-billing-config'
import {
  setPlatformValorSaasBillingCredentials,
  cutoverSubscriptionRailsToCentral,
} from '@/app/manage/actions/merchant-billing'

type CutoverResult = Awaited<ReturnType<typeof cutoverSubscriptionRailsToCentral>>

interface Props {
  config: PlatformValorSaasConfigSummary
  canEdit: boolean
}

export function DexaSaasBillingValorRailCard({ config, canEdit }: Props) {
  const [isSaving, startSaving] = useTransition()
  const [isCutting, startCutover] = useTransition()

  const [epi, setEpi] = useState(config.epi ?? '')
  const [appid, setAppid] = useState(config.appid ?? '')
  const [appkey, setAppkey] = useState('')

  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<CutoverResult | null>(null)

  const handleSave = () => {
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
    startCutover(async () => {
      try {
        const res = await cutoverSubscriptionRailsToCentral({ dryRun })
        setResult(res)
        if (!res.success) {
          toast.error(res.error ?? 'Cutover failed.')
          return
        }
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-5 w-5" />
          Central SaaS Billing (DEXA POS AI)
        </CardTitle>
        <CardDescription>
          The single Dexa-owned Valor merchant that charges every merchant&apos;s SaaS subscription, so
          those fees settle to Dexa&apos;s bank. Each merchant&apos;s subscription rail clones these
          credentials — this does not change any merchant&apos;s online-ordering account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm">
          <Row label="Provider">
            <Badge variant="secondary">Valor</Badge>
          </Row>
          <Row label="Status">
            <Badge variant={config.configured ? 'default' : 'secondary'}>
              {config.configured ? 'Configured' : 'Not configured'}
            </Badge>
          </Row>
          <Row label="EPI">
            <span className="font-mono">{config.epi ?? '—'}</span>
          </Row>
          <Row label="App key">
            <Badge variant={config.appKeyConfigured ? 'default' : 'secondary'}>
              {config.appKeyConfigured ? 'Vaulted' : 'Missing'}
            </Badge>
          </Row>
          <Row label="Active">
            <Badge variant={config.isActive ? 'default' : 'secondary'}>
              {config.isActive ? 'Yes' : 'No'}
            </Badge>
          </Row>
          {config.updatedAt ? (
            <Row label="Last updated">
              <span>{new Date(config.updatedAt).toLocaleString()}</span>
            </Row>
          ) : null}
        </div>

        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            Use the boarded DEXA POS AI EPI (e.g. <span className="font-mono">2501496431</span>) with its
            generated app id and app key. On staging, use the sandbox EPI that can process recurring.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="valor-saas-epi">Valor EPI</Label>
            <Input
              id="valor-saas-epi"
              inputMode="numeric"
              value={epi}
              onChange={(event) => setEpi(event.target.value)}
              placeholder="10-digit EPI (e.g. 2501496431)"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="valor-saas-appid">Valor App ID</Label>
            <Input
              id="valor-saas-appid"
              value={appid}
              onChange={(event) => setAppid(event.target.value)}
              placeholder="App id for this EPI"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="valor-saas-appkey">Valor App Key</Label>
          <Input
            id="valor-saas-appkey"
            type="password"
            value={appkey}
            onChange={(event) => setAppkey(event.target.value)}
            placeholder={config.appKeyConfigured ? 'Enter only to rotate the saved app key' : 'App key'}
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Stored in Supabase Vault. Leave blank to keep the existing saved app key.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving || !canEdit}>
            {isSaving && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save Central Rail
          </Button>
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Cut over existing subscription rails</h3>
            <p className="text-xs text-muted-foreground">
              Moves every merchant&apos;s subscription rail onto the central credentials: deactivates
              native schedules on old EPIs, re-points each rail, and invalidates cards vaulted under an
              old EPI (those merchants must re-add their card). Rails already on the central EPI are left
              untouched. Preview first with a dry run.
            </p>
          </div>

          {result ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div className="font-medium">
                {result.dryRun ? 'Dry run — nothing changed' : 'Cutover complete'}
                {result.error ? ` · ${result.error}` : ''}
              </div>
              <div className="text-muted-foreground">
                Rails migrated: {result.railsMigrated} · Schedules torn down: {result.schedulesTornDown} ·
                Cards invalidated: {result.cardsInvalidated}
              </div>
              {result.details.length ? (
                <ul className="mt-1 max-h-40 overflow-auto text-xs text-muted-foreground list-disc pl-4">
                  {result.details.slice(0, 50).map((detail, index) => (
                    <li key={index}>
                      {detail.action}
                      {detail.locationId ? ` · loc ${detail.locationId.slice(0, 8)}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              disabled={!canEdit}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              I understand this deactivates old native schedules and requires affected merchants to re-add
              their card.
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => runCutover(true)}
              disabled={isCutting || !canEdit || !config.configured}
            >
              {isCutting && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Preview (dry run)
            </Button>
            <Button
              variant="destructive"
              onClick={() => runCutover(false)}
              disabled={isCutting || !canEdit || !config.configured || !confirmed}
            >
              {isCutting && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Run cutover
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
