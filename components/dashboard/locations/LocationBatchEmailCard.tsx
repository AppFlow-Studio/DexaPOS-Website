'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Loader2, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { UpdateBatchSummaryEmailSettings } from '@/app/dashboard/actions/locations'

interface LocationBatchEmailCardProps {
  clerkOrgId: string
  locationId: string
  initialEnabled: boolean
  initialRecipient: string | null
  /** locations.email — fallback recipient, shown as the input placeholder. */
  locationEmail: string | null
}

export function LocationBatchEmailCard({
  clerkOrgId,
  locationId,
  initialEnabled,
  initialRecipient,
  locationEmail,
}: LocationBatchEmailCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [recipient, setRecipient] = useState(initialRecipient ?? '')
  const [saving, setSaving] = useState(false)

  // Baseline of what's persisted, so Save only lights up on a real change.
  const [savedEnabled, setSavedEnabled] = useState(initialEnabled)
  const [savedRecipient, setSavedRecipient] = useState(initialRecipient ?? '')

  const dirty =
    enabled !== savedEnabled || recipient.trim() !== savedRecipient.trim()
  const noFallback = !locationEmail && !recipient.trim()

  const handleSave = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      const result = await UpdateBatchSummaryEmailSettings(clerkOrgId, locationId, {
        enabled,
        recipient: recipient.trim() ? recipient.trim() : null,
      })

      if (!result.success || !result.data) {
        toast.error('Save failed', {
          description: result.error || 'Unable to save email settings.',
        })
        return
      }

      setEnabled(result.data.enabled)
      setRecipient(result.data.recipient ?? '')
      setSavedEnabled(result.data.enabled)
      setSavedRecipient(result.data.recipient ?? '')
      toast.success('Batch-out email settings saved')
    } catch (_err) {
      toast.error('Save failed', { description: 'An unexpected error occurred.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-card px-6 py-8 ring-1 ring-border/50">
      <div className="flex items-center gap-2 text-[1.0625rem] font-semibold text-[#0C4FD1] dark:text-[#6CA0FF]">
        <MailCheck className="h-[1.125rem] w-[1.125rem] shrink-0" />
        <span>Batch-Out Summary Email</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Automatically email the owner the batch-out summary each time this
        location settles a terminal. The email matches the printed ticket.
      </p>

      <div className="mt-5 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-0.5">
            <Label className="text-[0.9375rem] font-normal text-foreground">
              Auto-email on settlement
            </Label>
            <p className="text-sm text-muted-foreground">
              Off by default. No email is sent while this is disabled.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} className="shrink-0" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="batch-email-recipient" className="text-[0.9375rem] font-normal text-foreground">
            Recipient override
          </Label>
          <Input
            id="batch-email-recipient"
            type="email"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={
              locationEmail
                ? `Defaults to ${locationEmail}`
                : 'owner@example.com'
            }
            autoComplete="off"
            maxLength={254}
            className="h-10 rounded-xl border-transparent bg-muted/50 shadow-none"
          />
          <p className="text-sm text-muted-foreground">
            Leave blank to send to the location email
            {locationEmail ? ` (${locationEmail})` : ''}.
          </p>
          {enabled && noFallback && (
            <p className="text-sm text-destructive">
              This location has no email set — add a recipient override or no
              email can be sent.
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          className="gap-2 rounded-full px-4"
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </div>
    </div>
  )
}
