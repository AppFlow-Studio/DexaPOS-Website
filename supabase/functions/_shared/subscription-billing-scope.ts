export type SubscriptionBillingScope = 'merchant_tier' | 'location' | 'legacy'

export function subscriptionBillingScope(metadata: unknown): SubscriptionBillingScope {
  if (metadata !== null && typeof metadata === 'object' && 'billing_scope' in metadata) {
    if (metadata.billing_scope === 'merchant_tier' || metadata.billing_scope === 'legacy') {
      return metadata.billing_scope
    }
  }
  return 'location'
}

export function isSubscriptionBillingHeld(metadata: unknown): boolean {
  return subscriptionBillingScope(metadata) === 'legacy' || (
    metadata !== null && typeof metadata === 'object' &&
    'billing_setup_required' in metadata &&
    (metadata.billing_setup_required === true || metadata.billing_setup_required === 'true')
  )
}

export function billingProfileMatchesSubscription(
  subscription: { merchant_id: string; location_id: string; metadata?: unknown },
  profile: { merchant_id: string; location_id: string | null },
): boolean {
  if (isSubscriptionBillingHeld(subscription.metadata) || subscription.merchant_id !== profile.merchant_id) return false
  return profile.location_id === subscription.location_id ||
    (subscriptionBillingScope(subscription.metadata) === 'merchant_tier' && profile.location_id === null)
}

// Updating a merchant card must never rebind location subscriptions.
export function shouldRebindSubscriptionCard(
  subscription: { location_id: string; billing_profile_id: string | null; metadata?: unknown },
  locationId: string | null,
  replacedProfileIds: readonly string[],
): boolean {
  if (isSubscriptionBillingHeld(subscription.metadata)) return false
  if (subscriptionBillingScope(subscription.metadata) === 'location') {
    return locationId !== null && subscription.location_id === locationId
  }
  return locationId === null || (
    subscription.location_id === locationId &&
    subscription.billing_profile_id !== null &&
    replacedProfileIds.includes(subscription.billing_profile_id)
  )
}
