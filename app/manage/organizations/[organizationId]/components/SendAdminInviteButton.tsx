'use client'

import { Button } from '@/components/ui/button'
import { UserPlus2 } from 'lucide-react'
import { useState } from 'react'
import { AdminInviteWizard } from './AdminInviteWizard'

interface SendAdminInviteButtonProps {
  organizationId: string
  refetch: () => void
  role_types?: string
}

export const SendAdminInviteButton = ({ 
  organizationId, 
  refetch, 
  role_types = 'hq' 
}: SendAdminInviteButtonProps) => {
  const [isWizardOpen, setIsWizardOpen] = useState(false)

  return (
    <AdminInviteWizard
      organizationId={organizationId}
      orgType={role_types}
      open={isWizardOpen}
      onOpenChange={setIsWizardOpen}
      onSuccess={refetch}
    >
      <Button variant="outline" size="sm">
        <UserPlus2 className="h-4 w-4 mr-2" />
        Invite Admin
      </Button>
    </AdminInviteWizard>
  )
}
