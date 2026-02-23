import { requireAdminAuth } from '@/lib/admin/auth'

export default async function AuditLogsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminAuth('system.audit.view', {
    redirectToDashboard: true,
    requiredLabel: 'audit.view',
  })

  return <>{children}</>
}
