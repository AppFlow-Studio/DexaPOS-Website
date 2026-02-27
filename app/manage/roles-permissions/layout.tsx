import { requireAdminAuth } from '@/lib/admin/auth'

export default async function RolesPermissionsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminAuth('hq.team.manage', {
    redirectToDashboard: true,
    requiredLabel: 'roles.manage',
    minRoleLevel: 10,
  })

  return <>{children}</>
}
