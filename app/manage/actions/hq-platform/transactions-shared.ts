export const PLATFORM_PAYMENT_AUDIT_ACTIONS = [
  'view_transaction_list',
  'view_payment_detail',
  'export_data',
  'search_card_last_four',
] as const

export type PlatformPaymentAuditActionType = (typeof PLATFORM_PAYMENT_AUDIT_ACTIONS)[number]

export const PLATFORM_CHARGEBACK_STATUSES = [
  'notified',
  'under_review',
  'defended',
  'won',
  'lost',
  'expired',
] as const

export type PlatformChargebackStatus = (typeof PLATFORM_CHARGEBACK_STATUSES)[number]
