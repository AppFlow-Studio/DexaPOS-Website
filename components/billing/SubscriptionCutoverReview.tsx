'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listSubscriptionCutoverReviews, prepareSubscriptionCutover } from '@/app/manage/actions/subscription-cutover'

type Review = Awaited<ReturnType<typeof listSubscriptionCutoverReviews>>[number]

export function SubscriptionCutoverReview({ merchantId, merchantRouteId, onPrepared }: {
  merchantId: string
  merchantRouteId: string
  onPrepared: () => void
}) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    listSubscriptionCutoverReviews(merchantId).then(rows => {
      if (active) setReviews(rows)
    }).catch(() => {
      if (active) setError('Unable to load billing migration reviews. Reload before changing subscriptions.')
    })
    return () => { active = false }
  }, [merchantId])

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!reviews.length) return null
  return (
    <section aria-labelledby="billing-cutover-heading" className="space-y-4 border-y py-5">
      <div>
        <h2 id="billing-cutover-heading" className="font-semibold">Migrated billing: setup required</h2>
        <p className="text-sm text-muted-foreground">
          Historical invoices are unchanged. These replacement subscriptions cannot bill yet.
          Add each scope&apos;s card, reconcile old schedules and balances, then prepare it below.
          Preparation does not charge or activate anything.
        </p>
      </div>
      {reviews.map(review => (
        <CutoverRow key={review.id} review={review} merchantRouteId={merchantRouteId} onPrepared={() => {
          setReviews(rows => rows.filter(row => row.id !== review.id))
          onPrepared()
        }} />
      ))}
    </section>
  )
}

function CutoverRow({ review, merchantRouteId, onPrepared }: {
  review: Review
  merchantRouteId: string
  onPrepared: () => void
}) {
  const [date, setDate] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const prepare = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await prepareSubscriptionCutover({ subscriptionId: review.id, startDate: date, externalBillingReviewed: confirmed })
      if (!result.success) { setError(result.error || 'Preparation failed.'); return }
      onPrepared()
    } catch {
      setError('Preparation failed. Check the connection and reload before trying again.')
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 border-t pt-4">
      <p className="text-sm font-medium">
        {review.scope === 'merchant_tier' ? `Merchant tier: ${review.planName}` : `Location services: ${review.locationName}`}
      </p>
      <Link className="text-sm text-primary underline" href={`/manage/merchants/${encodeURIComponent(merchantRouteId)}?tab=billing&billingScope=${encodeURIComponent(review.locationId)}`}>
        Set up {review.scope === 'merchant_tier' ? 'anchor or merchant' : 'this location\'s'} card
      </Link>
      <label className="block max-w-xs space-y-1 text-sm">
        <span>New billing start date</span>
        <Input type="date" value={date} disabled={busy} onChange={event => setDate(event.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
        <span>I verified external recurring schedules and historical balances, and this date will not duplicate an existing charge or paid period.</span>
      </label>
      <Button disabled={busy || !date || !confirmed} onClick={prepare} variant="outline">
        {busy ? 'Preparing...' : 'Prepare without charging'}
      </Button>
      <p className="text-xs text-muted-foreground">After preparation, review pricing and use Save &amp; Charge with this start date to activate.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
