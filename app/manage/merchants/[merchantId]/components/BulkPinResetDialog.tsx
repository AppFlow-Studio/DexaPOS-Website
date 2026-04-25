'use client'

import { useState } from 'react'
import { useAdminBulkResetPins } from '@/lib/queries/use-admin-staff'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AlertTriangle, Download, Loader2, Key, CheckCircle } from 'lucide-react'
import type { BulkPinResetResult } from '@/types/staff'
import type { LocationSummary } from '@/types/merchant'

interface BulkPinResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  merchantId: string
  merchantName: string
  locations: LocationSummary[]
}

type DialogStep = 'confirm' | 'results'

export function BulkPinResetDialog({
  open,
  onOpenChange,
  merchantId,
  merchantName,
  locations,
}: BulkPinResetDialogProps) {
  const [step, setStep] = useState<DialogStep>('confirm')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [customPin, setCustomPin] = useState('')
  const [results, setResults] = useState<BulkPinResetResult[]>([])

  const bulkResetMutation = useAdminBulkResetPins()

  const resetDialog = () => {
    setStep('confirm')
    setLocationFilter('all')
    setCustomPin('')
    setResults([])
  }

  const handleClose = () => {
    resetDialog()
    onOpenChange(false)
  }

  const handleConfirmReset = async () => {
    if (customPin && !/^\d{4,6}$/.test(customPin)) {
      toast.error('Custom PIN must be 4–6 digits')
      return
    }
    try {
      const result = await bulkResetMutation.mutateAsync({
        merchantId,
        locationId: locationFilter !== 'all' ? locationFilter : null,
        customPin: customPin || undefined,
      })

      if (result.success && result.results) {
        setResults(result.results)
        setStep('results')
        toast.success(`${result.results.length} PIN(s) reset successfully`)
      } else {
        toast.error(result.error || 'Failed to reset PINs')
      }
    } catch {
      toast.error('Failed to reset PINs')
    }
  }

  const handleExportCSV = () => {
    if (results.length === 0) return

    const headers = ['Staff Name', 'New PIN']
    const rows = results.map((r) => [r.staff_name, r.new_pin])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pin-reset-${merchantName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`
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
                <Key className="h-5 w-5" />
                Bulk Reset PINs
              </DialogTitle>
              <DialogDescription>
                Reset PINs for all active staff members at {merchantName}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Warning */}
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>
                  This action will invalidate all existing PINs for the selected
                  location(s). Staff members will need to use their new PINs to
                  access the POS system.
                </AlertDescription>
              </Alert>

              {/* Location Filter */}
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
                  PINs will be reset for all active staff at: {selectedLocationName}
                </p>
              </div>

              {/* Optional Custom PIN */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Custom PIN{' '}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  placeholder="Leave blank to auto-generate"
                  value={customPin}
                  onChange={(e) => setCustomPin(e.target.value.replace(/\D/g, ''))}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  If set, all staff will receive this same 4–6 digit PIN.
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
                Reset All PINs
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                PINs Reset Successfully
              </DialogTitle>
              <DialogDescription>
                {results.length} staff member(s) have been assigned new PINs.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Warning about one-time display */}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Important</AlertTitle>
                <AlertDescription>
                  Save or export these PINs securely before closing this dialog.
                </AlertDescription>
              </Alert>

              {/* Results Table */}
              <div className="max-h-64 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff Name</TableHead>
                      <TableHead className="text-right">New PIN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((result) => (
                      <TableRow key={result.staff_profile_id}>
                        <TableCell>{result.staff_name}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-lg">
                          {result.new_pin}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Export Button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={handleExportCSV}
              >
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
