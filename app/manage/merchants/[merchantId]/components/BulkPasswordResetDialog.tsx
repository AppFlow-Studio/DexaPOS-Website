'use client'

import { useState } from 'react'
import { useAdminBulkResetPasswords } from '@/lib/queries/use-admin-staff'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { AlertTriangle, Download, Loader2, Lock, CheckCircle } from 'lucide-react'
import type { BulkPasswordResetResult } from '@/app/manage/actions/admin-merchant/staff'
import type { LocationSummary } from '@/types/merchant'

interface BulkPasswordResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  merchantName: string
  locations: LocationSummary[]
}

type DialogStep = 'confirm' | 'results'

export function BulkPasswordResetDialog({
  open,
  onOpenChange,
  merchantId,
  merchantName,
  locations,
}: BulkPasswordResetDialogProps) {
  const [step, setStep] = useState<DialogStep>('confirm')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [results, setResults] = useState<BulkPasswordResetResult[]>([])

  const bulkResetMutation = useAdminBulkResetPasswords()

  const resetDialog = () => {
    setStep('confirm')
    setLocationFilter('all')
    setResults([])
  }

  const handleClose = () => {
    resetDialog()
    onOpenChange(false)
  }

  const handleConfirmReset = async () => {
    try {
      const result = await bulkResetMutation.mutateAsync({
        merchantId,
        locationId: locationFilter !== 'all' ? locationFilter : null,
      })

      if (result.success && result.results) {
        setResults(result.results)
        setStep('results')
        const errCount = result.errors?.length ?? 0
        if (errCount > 0) {
          toast.warning(
            `${result.results.length} password(s) reset, ${errCount} failed`,
          )
        } else {
          toast.success(`${result.results.length} password(s) reset successfully`)
        }
      } else {
        toast.error(result.error || 'Failed to reset passwords')
      }
    } catch {
      toast.error('Failed to reset passwords')
    }
  }

  const handleExportCSV = () => {
    if (results.length === 0) return

    const headers = ['Staff Name', 'Email', 'New Password']
    const rows = results.map((r) => [r.staff_name, r.email, r.new_password])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `password-reset-${merchantName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('CSV exported successfully')
  }

  const selectedLocationName =
    locationFilter === 'all'
      ? 'All Locations'
      : locations.find((l) => l.id === locationFilter)?.name || 'Selected Location'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        {step === 'confirm' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Bulk Reset Passwords
              </DialogTitle>
              <DialogDescription>
                Reset dashboard login passwords for all active Clerk staff at{' '}
                {merchantName}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  This will invalidate current passwords and sign all affected staff
                  out of their active sessions. Only dashboard (Clerk) users are
                  affected — POS-only staff are skipped.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <label className="text-sm font-medium">Filter by Location</label>
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations
                      .filter((l) => l.is_active)
                      .map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Passwords will be reset for all active dashboard users at:{' '}
                  {selectedLocationName}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmReset}
                disabled={bulkResetMutation.isPending}
              >
                {bulkResetMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Reset All Passwords
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Passwords Reset Successfully
              </DialogTitle>
              <DialogDescription>
                {results.length} staff member(s) have been assigned new passwords.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  These passwords are shown only once. Export or securely share them
                  with staff before closing.
                </AlertDescription>
              </Alert>

              <div className="max-h-64 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">New Password</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow key={result.clerk_user_id}>
                        <TableCell className="font-medium">{result.staff_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {result.email || '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {result.new_password}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Button variant="outline" className="w-full" onClick={handleExportCSV}>
                <Download className="mr-2 h-4 w-4" />
                Export as CSV
              </Button>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
