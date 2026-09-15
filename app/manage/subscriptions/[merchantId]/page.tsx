import { redirect } from 'next/navigation'

/**
 * The subscription workspace now lives inline as a tab on the merchant detail
 * page. This route is kept only so existing deep-links (e.g. subscription
 * notification emails / in-app links carrying ?serviceRequest / ?request /
 * ?hardwareRequest) continue to resolve — it forwards to the merchant's
 * Subscriptions tab, preserving any incoming query string.
 */
export default async function ManageMerchantSubscriptionsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ merchantId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { merchantId } = await params
  const incoming = await searchParams

  const query = new URLSearchParams()
  query.set('tab', 'subscriptions')

  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'tab') continue
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry))
    } else if (value != null) {
      query.set(key, value)
    }
  }

  redirect(`/manage/merchants/${merchantId}?${query.toString()}`)
}
