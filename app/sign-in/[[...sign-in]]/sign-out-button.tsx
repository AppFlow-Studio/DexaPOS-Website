'use client'

import { SignOutButton } from '@clerk/nextjs'
import { LogOut } from 'lucide-react'

export function SignOutButtonClient() {
  return (
    <SignOutButton>
      <button className="mt-3 flex items-center justify-center gap-2 w-full px-4 py-3 text-muted-foreground rounded-xl font-medium hover:bg-muted/60 transition-colors">
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </SignOutButton>
  )
}
