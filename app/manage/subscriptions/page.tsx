import { redirect } from 'next/navigation'

/**
 * Subscriptions are now managed per-merchant from the Merchants section
 * (each merchant has a Subscriptions tab). The standalone index has been
 * folded in — send visitors to the merchants list.
 */
export default function ManageSubscriptionsIndexRedirect() {
  redirect('/manage/merchants')
}
