import { requireAdminAuth } from '@/lib/admin/auth'

export default async function UsersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminAuth('hq.team.manage', {
    redirectToDashboard: true,
    requiredLabel: 'users.manage',
  })

  return <>{children}</>
}
