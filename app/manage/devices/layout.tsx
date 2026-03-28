import { requireAdminAuth } from '@/lib/admin/auth'

export default async function ManageDevicesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminAuth('system.config.manage', {
    redirectToDashboard: true,
    requiredLabel: 'system.config.manage',
  })

  return children
}
