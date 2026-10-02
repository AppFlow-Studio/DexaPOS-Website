'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel, PanelSection } from '@/components/dashboard/shell'
import { Field, StatusItem, StatusWell, formatTimestamp } from './IntegrationPrimitives'
import {
  savePlatformNmiBillingConfig,
  type PlatformNmiBillingConfigSummary,
} from '@/app/manage/actions/platform-billing-config'

interface Props {
  config: PlatformNmiBillingConfigSummary
  canEdit: boolean
}

/**
 * The Dexa-owned NMI billing account. Rendered on /manage/nmi-integration and
 * /manage/settings/integrations.
 *
 * One Panel, two sections: what is saved (words in a muted well, §3.5 — no
 * status hues), then the credentials form. Secrets are write-only, so the well
 * is the only place that says whether one exists.
 */
export function DexaBillingNmiRailCard({ config, canEdit }: Props) {
  const [isPending, startTransition] = useTransition()
  const [label, setLabel] = useState(config.label)
  const [tokenizationKey, setTokenizationKey] = useState(config.tokenizationKey ?? '')
  const [privateApiKey, setPrivateApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const missing = [
    !config.tokenizationKey && 'tokenization key',
    !config.apiKeyConfigured && 'private API key',
  ].filter(Boolean) as string[]
  const isConfigured = missing.length === 0

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      try {
        const result = await savePlatformNmiBillingConfig({
          label,
          tokenizationKey,
          privateApiKey,
          webhookSecret,
          isActive: true,
        })

        if (!result.success) {
          toast.error(result.error ?? 'Failed to save the Dexa Billing NMI account.')
          return
        }

        setPrivateApiKey('')
        setWebhookSecret('')
        toast.success('Dexa Billing NMI account saved.')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to save the Dexa Billing NMI account.')
      }
    })
  }

  return (
    <Panel>
      <PanelSection
        label="Dexa Billing account"
        caption="Charges merchant subscriptions and vaults merchant billing cards. Location NMI accounts for online ordering are separate and are not changed here."
        /* Scope, not description: it says which NMI accounts this page does
           not touch, so it stays on phones (§13.4). */
        showCaptionOnMobile
      >
        <StatusWell>
          <StatusItem
            term="Status"
            value={isConfigured ? 'Configured' : 'Incomplete'}
            note={isConfigured ? undefined : `Needs a ${missing.join(' and ')}`}
          />
          <StatusItem
            term="Private API key"
            value={config.apiKeyConfigured ? 'Saved' : 'Not set'}
          />
          <StatusItem
            term="Webhook signing"
            value={config.webhookSecretConfigured ? 'Saved' : 'Not set'}
            note={config.webhookSecretConfigured ? undefined : 'Invoice-payment webhooks are rejected until set'}
          />
          <StatusItem
            term="Last updated"
            value={formatTimestamp(config.updatedAt, 'Never saved')}
          />
        </StatusWell>
      </PanelSection>

      <PanelSection
        label="Credentials"
        caption="Keys from the Dexa-owned NMI merchant account. Secrets are stored in Supabase Vault and are never shown again — leave a secret blank to keep the saved one."
      >
        <form onSubmit={handleSubmit} className="grid gap-6 md:grid-cols-2">
          <Field id="dexa-billing-label" label="Account label">
            <Input
              id="dexa-billing-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Dexa Billing"
              disabled={!canEdit}
            />
          </Field>

          <Field
            id="dexa-billing-public-key"
            label="Tokenization key"
            hint="Public Collect.js key. Required."
          >
            <Input
              id="dexa-billing-public-key"
              value={tokenizationKey}
              onChange={(event) => setTokenizationKey(event.target.value)}
              placeholder="Public Collect.js tokenization key"
              aria-required
              disabled={!canEdit}
            />
          </Field>

          <Field
            id="dexa-billing-private-key"
            label="Private API key"
            hint={config.apiKeyConfigured ? 'Leave blank to keep the saved key.' : undefined}
          >
            <Input
              id="dexa-billing-private-key"
              type="password"
              autoComplete="off"
              value={privateApiKey}
              onChange={(event) => setPrivateApiKey(event.target.value)}
              placeholder={config.apiKeyConfigured ? 'Saved — enter a new key to rotate' : 'Private API key'}
              disabled={!canEdit}
            />
          </Field>

          <Field
            id="dexa-billing-webhook-secret"
            label="Webhook signing secret"
            hint="Verifies NMI invoice-payment webhooks before invoice status changes."
          >
            <Input
              id="dexa-billing-webhook-secret"
              type="password"
              autoComplete="off"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              placeholder={
                config.webhookSecretConfigured ? 'Saved — enter a new secret to rotate' : 'Webhook signing secret'
              }
              disabled={!canEdit}
            />
          </Field>

          {/* Centred on a phone, right-aligned from `sm` up — the same footer as
              create-organization. */}
          <div className="flex items-center justify-center sm:justify-end md:col-span-2">
            {/* 44px on phones (§13.6); busy is said by the label, not a spinner (§4.10). */}
            <Button
              type="submit"
              disabled={isPending || !canEdit}
              className="h-11 w-full sm:h-9 sm:w-auto"
            >
              {isPending ? 'Saving…' : 'Save billing account'}
            </Button>
          </div>
        </form>
      </PanelSection>
    </Panel>
  )
}
