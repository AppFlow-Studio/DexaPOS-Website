import { requireAdminAuth } from '@/lib/admin/auth'

export default async function CreateMerchantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminAuth('hq.merchant.create', {
    redirectToDashboard: true,
    requiredLabel: 'merchants.create',
  })

  return <>{children}</>
}
