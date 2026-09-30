/**
 * Pure helpers behind the merchant subscription page's "statement" layout.
 *
 * They live outside `MerchantSubscriptionOverviewCard.tsx` because every
 * export of a `'use client'` module becomes a client reference — a server
 * component or a test importing one gets a proxy, not the function.
 */

/* -------------------------------------------------------------------------- */
/* Next charge                                                                */
/* -------------------------------------------------------------------------- */

export type BillingMethod = 'card' | 'ach'

export interface ServicePricingInput {
  pricing_model: 'flat' | 'per_unit' | 'tiered'
  base_price_monthly: number
  additional_unit_price: number | null
  included_quantity: number
  card_surcharge_pct: number
}

export interface AssignmentInput {
  location_id: string
  service_id: string
  quantity: number
}

export interface ChargeLine {
  subtotal: number
  fee: number
  total: number
}

export interface NextChargeEstimate {
  tier: ChargeLine
  /** Add-on charges per location, keyed by location id. Locations with none are absent. */
  locations: Record<string, ChargeLine & { addOnCount: number }>
  addOnSubtotal: number
  addOnCount: number
  /** Card fee across the tier and every location. */
  fee: number
  total: number
}

const roundCents = (value: number) => Math.round(value * 100) / 100

/** An add-on's monthly price before any card fee. */
export function serviceSubtotal(service: ServicePricingInput, quantity: number): number {
  const safeQuantity = Math.max(1, Math.floor(quantity || 1))
  if (service.pricing_model === 'flat') return service.base_price_monthly
  if (service.pricing_model === 'per_unit') return service.base_price_monthly * safeQuantity
  return (
    service.base_price_monthly +
    Math.max(0, safeQuantity - service.included_quantity) * (service.additional_unit_price ?? 0)
  )
}

/**
 * The card fee `calculate_subscription_total()` adds: a percentage of the
 * whole subtotal, waived for ACH.
 */
export function cardFee(subtotal: number, pct: number, method: BillingMethod): number {
  if (method !== 'card' || subtotal <= 0 || pct <= 0) return 0
  return roundCents(subtotal * (pct / 100))
}

/**
 * What the merchant will be charged next cycle, including the card fee.
 *
 * Mirrors how billing actually splits the money: the merchant tier is one
 * subscription charged to the plan card, and each location's add-ons are a
 * separate subscription charged to that location's card. Each one takes the
 * fee on its own subtotal — for the tier at the plan's rate, for a location at
 * the highest rate among its add-ons (`greatest()` in the SQL).
 *
 * The page used to add the fee to add-ons only, so its estimate read $180 above
 * invoices that charged the card ~$184.
 */
export function estimateNextCharge(input: {
  tierSubtotal: number
  tierSurchargePct: number
  tierBillingMethod: BillingMethod
  assignments: AssignmentInput[]
  servicesById: Record<string, ServicePricingInput | undefined>
  locationBillingMethod: (locationId: string) => BillingMethod
}): NextChargeEstimate {
  const tierFee = cardFee(input.tierSubtotal, input.tierSurchargePct, input.tierBillingMethod)
  const tier: ChargeLine = {
    subtotal: input.tierSubtotal,
    fee: tierFee,
    total: roundCents(input.tierSubtotal + tierFee),
  }

  const perLocation = new Map<string, { subtotal: number; pct: number; addOnCount: number }>()
  for (const assignment of input.assignments) {
    // Assignments that resolve to no catalogue service cannot be priced, and
    // counting them made the page claim "4 active" over a $0.00 breakdown.
    const service = input.servicesById[assignment.service_id]
    if (!service) continue
    const current = perLocation.get(assignment.location_id) ?? { subtotal: 0, pct: 0, addOnCount: 0 }
    current.subtotal += serviceSubtotal(service, assignment.quantity)
    current.pct = Math.max(current.pct, service.card_surcharge_pct)
    current.addOnCount += 1
    perLocation.set(assignment.location_id, current)
  }

  const locations: NextChargeEstimate['locations'] = {}
  let addOnSubtotal = 0
  let addOnCount = 0
  let fee = tierFee
  for (const [locationId, entry] of perLocation) {
    const subtotal = roundCents(entry.subtotal)
    const locationFee = cardFee(subtotal, entry.pct, input.locationBillingMethod(locationId))
    locations[locationId] = {
      subtotal,
      fee: locationFee,
      total: roundCents(subtotal + locationFee),
      addOnCount: entry.addOnCount,
    }
    addOnSubtotal += subtotal
    addOnCount += entry.addOnCount
    fee += locationFee
  }

  addOnSubtotal = roundCents(addOnSubtotal)
  fee = roundCents(fee)

  return {
    tier,
    locations,
    addOnSubtotal,
    addOnCount,
    fee,
    total: roundCents(input.tierSubtotal + addOnSubtotal + fee),
  }
}

/* -------------------------------------------------------------------------- */
/* Failure reasons                                                            */
/* -------------------------------------------------------------------------- */

export type PaymentFailureKind = 'card' | 'processor' | 'unknown'

export interface PaymentFailureReason {
  /**
   * `card` — something about the card; a new card can fix it.
   * `processor` — our side or the processor's; a new card will not help.
   */
  kind: PaymentFailureKind
  message: string
}

const FAILURE_RULES: Array<{ pattern: RegExp; reason: PaymentFailureReason }> = [
  {
    pattern: /insufficient|nsf|not sufficient|over ?limit/i,
    reason: { kind: 'card', message: 'The card was declined for insufficient funds.' },
  },
  {
    pattern: /expired|expiration|exp(iry)? date/i,
    reason: { kind: 'card', message: 'The card on file has expired.' },
  },
  {
    pattern: /cvv|cvc|security code/i,
    reason: { kind: 'card', message: "The card's security code didn't match." },
  },
  {
    pattern: /\bzip\b|postal|\bavs\b/i,
    reason: { kind: 'card', message: "The billing ZIP code didn't match the card." },
  },
  {
    pattern: /invalid (card|account)|card number|invalid pan/i,
    reason: { kind: 'card', message: 'The card number was not accepted.' },
  },
  {
    pattern: /declin|do not honou?r|pick ?up|lost|stolen|restricted/i,
    reason: { kind: 'card', message: 'The card was declined. Try another card or contact your bank.' },
  },
  {
    pattern: /no (usable )?card|missing (card|billing)|billing profile|vault/i,
    reason: { kind: 'card', message: "There's no usable card on file." },
  },
  {
    pattern:
      /provision|empty (response|body)|\bepi\b|http|timeout|timed out|network|gateway|unavailable|internal|recurring|processor|valor/i,
    reason: {
      kind: 'processor',
      message: "A processing problem on our side stopped the payment. It isn't a problem with your card.",
    },
  },
]

const UNKNOWN_FAILURE: PaymentFailureReason = {
  kind: 'unknown',
  message: "The payment didn't go through.",
}

/**
 * An owner-facing sentence for `subscription_invoices.last_payment_error`.
 *
 * That column holds raw processor text — e.g. "Valor returned HTTP 200 with an
 * empty response body … this EPI may not be provisioned for native recurring".
 * It must never reach a merchant verbatim: it is jargon, it can expose
 * infrastructure details, and it wrongly suggests their card is at fault.
 * Order matters — specific card reasons are tested before the processor
 * catch-all, which would otherwise swallow any message mentioning "Valor".
 */
export function describePaymentFailure(raw: string | null | undefined): PaymentFailureReason {
  const text = raw?.trim()
  if (!text) return UNKNOWN_FAILURE
  return FAILURE_RULES.find((rule) => rule.pattern.test(text))?.reason ?? UNKNOWN_FAILURE
}

/* -------------------------------------------------------------------------- */
/* Payments by month                                                          */
/* -------------------------------------------------------------------------- */

export interface StatementInvoiceInput {
  billing_period_start: string | null
  created_at: string
  status: string
  total_amount: number
}

export interface InvoiceMonthGroup<T extends StatementInvoiceInput> {
  /** `YYYY-MM`. */
  key: string
  /** e.g. "September 2026". */
  label: string
  invoices: T[]
  /** Everything billed that month, excluding voided invoices. */
  billed: number
  /** Open, processing and failed invoices. */
  unpaid: number
  failedCount: number
}

export const UNPAID_INVOICE_STATUSES = ['open', 'processing', 'failed']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * `YYYY-MM` read straight off the string. Parsing "2026-09-01" through `Date`
 * yields UTC midnight, which is still August 31st west of Greenwich.
 */
function monthKey(invoice: StatementInvoiceInput): string | null {
  const source = invoice.billing_period_start || invoice.created_at
  const match = /^(\d{4})-(\d{2})/.exec(source ?? '')
  return match ? `${match[1]}-${match[2]}` : null
}

/**
 * Invoices grouped by the month they bill for, newest month first, with the
 * totals an accountant asks for. Split billing issues one invoice for the plan
 * plus one per location, so nothing else on the page adds a month up.
 */
export function groupInvoicesByMonth<T extends StatementInvoiceInput>(invoices: T[]): InvoiceMonthGroup<T>[] {
  const groups = new Map<string, InvoiceMonthGroup<T>>()

  for (const invoice of invoices) {
    const key = monthKey(invoice) ?? 'unknown'
    let group = groups.get(key)
    if (!group) {
      const [year, month] = key.split('-')
      group = {
        key,
        label: key === 'unknown' ? 'Undated' : `${MONTH_NAMES[Number(month) - 1]} ${year}`,
        invoices: [],
        billed: 0,
        unpaid: 0,
        failedCount: 0,
      }
      groups.set(key, group)
    }

    const amount = Number(invoice.total_amount || 0)
    group.invoices.push(invoice)
    if (invoice.status !== 'voided') group.billed += amount
    if (UNPAID_INVOICE_STATUSES.includes(invoice.status)) group.unpaid += amount
    if (invoice.status === 'failed') group.failedCount += 1
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      billed: roundCents(group.billed),
      unpaid: roundCents(group.unpaid),
      invoices: [...group.invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }))
    .sort((a, b) => (a.key === 'unknown' ? 1 : b.key === 'unknown' ? -1 : b.key.localeCompare(a.key)))
}
