'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CreditCard, KeyRound, RefreshCw, Shield, Store } from 'lucide-react'
import {
  savePlatformNmiBillingConfig,
  type PlatformNmiBillingConfigSummary,
} from '@/app/manage/actions/platform-billing-config'

interface Props {
  config: PlatformNmiBillingConfigSummary
  canEdit: boolean
}

export function DexaBillingNmiRailCard({ config, canEdit }: Props) {
  const [isPending, startTransition] = useTransition()
  const [label, setLabel] = useState(config.label)
  const [tokenizationKey, setTokenizationKey] = useState(config.tokenizationKey ?? '')
  const [privateApiKey, setPrivateApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const handleSave = () => {
    startTransition(async () => {
      const result = await savePlatformNmiBillingConfig({
        label,
        tokenizationKey,
        privateApiKey,
        webhookSecret,
        isActive: true,
      })

      if (!result.success) {
        return
      }

      setPrivateApiKey('')
      setWebhookSecret('')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Dexa Billing NMI Account
        </CardTitle>
        <CardDescription>
          Stores the platform-owned NMI merchant account used for merchant billing-card vaulting and
          subscription charges. This does not change location online-ordering NMI accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm">
          <Row label="Provider">
            <Badge variant="secondary">NMI</Badge>
          </Row>
          <Row label="Status">
            <Badge variant={config.apiKeyConfigured && config.tokenizationKey ? 'default' : 'secondary'}>
              {config.apiKeyConfigured && config.tokenizationKey ? 'Configured' : 'Incomplete'}
            </Badge>
          </Row>
          <Row label="Webhook signing">
            <Badge variant={config.webhookSecretConfigured ? 'default' : 'secondary'}>
              {config.webhookSecretConfigured ? 'Configured' : 'Missing'}
            </Badge>
          </Row>
          <Row label="Scope">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Store className="h-3.5 w-3.5 text-muted-foreground" />
              Dexa system billing only
            </span>
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
            Use a dedicated Dexa-owned NMI merchant account here. Merchant location NMI accounts for
            online ordering stay separate and are not modified by this setting.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="dexa-billing-label">Account Label</Label>
            <Input
              id="dexa-billing-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Dexa Billing"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dexa-billing-public-key">NMI Tokenization Key</Label>
            <Input
              id="dexa-billing-public-key"
              value={tokenizationKey}
              onChange={(event) => setTokenizationKey(event.target.value)}
              placeholder="Public Collect.js tokenization key"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dexa-billing-private-key">NMI Private API Key</Label>
          <Input
            id="dexa-billing-private-key"
            type="password"
            value={privateApiKey}
            onChange={(event) => setPrivateApiKey(event.target.value)}
            placeholder={config.apiKeyConfigured ? 'Enter only to rotate the saved private key' : 'Private API key'}
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Stored in Supabase Vault. Leave blank when you only want to keep the existing saved private key.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dexa-billing-webhook-secret">NMI Webhook Signing Secret</Label>
          <Input
            id="dexa-billing-webhook-secret"
            type="password"
            value={webhookSecret}
            onChange={(event) => setWebhookSecret(event.target.value)}
            placeholder={
              config.webhookSecretConfigured
                ? 'Stored securely. Enter a new value only to rotate it.'
                : 'Webhook signing secret'
            }
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Used to verify NMI invoice-payment webhooks before updating invoice status.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isPending || !canEdit}>
            {isPending && <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save Billing Rail
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
