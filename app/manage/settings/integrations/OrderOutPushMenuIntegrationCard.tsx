'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CheckCircle2, Plug, RefreshCw } from 'lucide-react'
import { registerOrderOutPushMenuWebhook } from '@/app/manage/actions/orderout-webhooks'

interface Props {
  expectedEndpoint: string | null
  lastRegisteredAt: string | null
  lastRegisteredBy: string | null
  dlqCount: number
  canRegister: boolean
}

const DELIVERY_SERVICES = ['UBEREATS', 'GRUBHUB', 'DOORDASH']

export function OrderOutPushMenuIntegrationCard({
  expectedEndpoint,
  lastRegisteredAt,
  lastRegisteredBy,
  dlqCount,
  canRegister,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [registered, setRegistered] = useState<{
    endpoint?: string
    at: string
  } | null>(
    lastRegisteredAt
      ? { endpoint: expectedEndpoint ?? undefined, at: lastRegisteredAt }
      : null
  )

  const handleRegister = () => {
    startTransition(async () => {
      const result = await registerOrderOutPushMenuWebhook()
      if (result.success) {
        toast.success('push_menu webhook registered with OrderOut')
        setRegistered({
          endpoint: result.endpoint,
          at: new Date().toISOString(),
        })
      } else {
        toast.error(result.error || 'Registration failed')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          OrderOut push_menu Webhook
        </CardTitle>
        <CardDescription>
          One-time, platform-wide registration. After registration, OrderOut
          sends async per-platform results (UBEREATS / GRUBHUB / DOORDASH) to
          Dexa after every merchant menu push.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 text-sm">
          <Row label="Endpoint">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">
              {expectedEndpoint ?? 'NEXT_PUBLIC_SUPABASE_URL not configured'}
            </code>
          </Row>
          <Row label="Delivery services">
            <div className="flex flex-wrap gap-1.5">
              {DELIVERY_SERVICES.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">
                  {s}
                </Badge>
              ))}
            </div>
          </Row>
          <Row label="Last registered">
            {registered?.at ? (
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                {new Date(registered.at).toLocaleString()}
                {lastRegisteredBy && (
                  <span className="text-muted-foreground">
                    by {lastRegisteredBy}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">Never</span>
            )}
          </Row>
          <Row label="DLQ (push_menu)">
            <Badge variant={dlqCount > 0 ? 'destructive' : 'outline'}>
              {dlqCount > 0 && <AlertTriangle className="h-3 w-3 mr-1" />}
              {dlqCount} unprocessed
            </Badge>
          </Row>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Requires <code>ORDEROUT_API_KEY</code> and{' '}
            <code>ORDEROUT_WEBHOOK_SECRET</code> in Supabase project secrets.
          </p>
          <Button
            onClick={handleRegister}
            disabled={isPending || !canRegister}
            size="sm"
          >
            {isPending && <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {registered ? 'Re-register' : 'Register with OrderOut'}
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
