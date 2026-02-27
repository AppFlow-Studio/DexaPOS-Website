import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldX, ArrowLeft, Home } from 'lucide-react'
import Link from 'next/link'

interface UnauthorizedPageProps {
  searchParams: Promise<{ required?: string; reason?: string }>
}

export default async function UnauthorizedPage({
  searchParams,
}: UnauthorizedPageProps) {
  const params = await searchParams
  const { required, reason } = params

  // Map permission codes to friendly names
  const permissionNames: Record<string, string> = {
    'hq.merchant.view': 'View Merchants',
    'hq.merchant.create': 'Create Merchants',
    'hq.merchant.update': 'Edit Merchants',
    'hq.merchant.delete': 'Delete Merchants',
    'hq.merchant.analytics': 'View Merchant Analytics',
    'hq.merchant.transactions': 'View Transactions',
    'hq.merchant.manage_team': 'Manage Merchant Teams',
    'hq.support.view': 'View Support',
    'hq.support.manage': 'Manage Support',
    'hq.team.view': 'View Team',
    'hq.team.manage': 'Manage Team',
    'hq.org.view': 'View Organizations',
    'hq.org.manage': 'Manage Organizations',
    'system.analytics.view': 'View System Analytics',
    'system.audit.view': 'View Audit Logs',
    'system.config.manage': 'Manage System Config',
    'system.billing.manage': 'Manage Billing',
  }

  const getTitle = () => {
    if (reason === 'no_hq_role') {
      return 'No Role Assigned'
    }
    return 'Access Denied'
  }

  const getDescription = () => {
    if (reason === 'no_hq_role') {
      return 'Your account does not have an HQ role assigned. Please contact your administrator to get access.'
    }
    if (required) {
      const friendlyName = permissionNames[required] || required
      return `You don't have the required permission: ${friendlyName}`
    }
    return "You don't have permission to access this page."
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">{getTitle()}</CardTitle>
          <CardDescription className="text-base">
            {getDescription()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <Button asChild variant="default" className="w-full">
              <Link href="/manage">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go to Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Return Home
              </Link>
            </Button>
          </div>
          {required && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Required permission: <code className="bg-muted px-1 py-0.5 rounded">{required}</code>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
