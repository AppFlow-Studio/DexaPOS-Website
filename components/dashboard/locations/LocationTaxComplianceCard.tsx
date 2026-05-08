'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { UpdateLocation } from '@/app/dashboard/actions/locations'
import type { Location } from '@/types/merchant_locations'

interface LocationTaxComplianceCardProps {
  location: Location
  onUpdated?: () => void
}

type TaxRegistrationStatus = 'pending' | 'verified' | 'expired'

export function LocationTaxComplianceCard({ location, onUpdated }: LocationTaxComplianceCardProps) {
  const queryClient = useQueryClient()
  const [viewLocation, setViewLocation] = useState(location)
  const [showTaxDialog, setShowTaxDialog] = useState(false)
  const [isSavingTax, setIsSavingTax] = useState(false)
  const [taxForm, setTaxForm] = useState({
    ein: location.ein || '',
    taxId: location.tax_id || '',
    salesTaxRate:
      location.sales_tax_rate !== null && location.sales_tax_rate !== undefined
        ? String((location.sales_tax_rate * 100).toFixed(4).replace(/\.?0+$/, ''))
        : '',
    taxRegistrationStatus: (location.tax_registration_status || 'pending') as TaxRegistrationStatus,
  })

  useEffect(() => {
    setViewLocation(location)
    setTaxForm({
      ein: location.ein || '',
      taxId: location.tax_id || '',
      salesTaxRate:
        location.sales_tax_rate !== null && location.sales_tax_rate !== undefined
          ? String((location.sales_tax_rate * 100).toFixed(4).replace(/\.?0+$/, ''))
          : '',
      taxRegistrationStatus: (location.tax_registration_status || 'pending') as TaxRegistrationStatus,
    })
  }, [location])

  const maskedEin = viewLocation.ein_last_four ? `****${viewLocation.ein_last_four}` : 'Not set'
  const salesTaxRateDisplay =
    viewLocation.sales_tax_rate !== null && viewLocation.sales_tax_rate !== undefined
      ? `${(viewLocation.sales_tax_rate * 100).toFixed(2)}%`
      : 'Not set'

  const taxStatusClass =
    viewLocation.tax_registration_status === 'verified'
      ? 'bg-green-600'
      : viewLocation.tax_registration_status === 'expired'
        ? 'bg-destructive'
        : ''

  const handleSaveTaxCompliance = async () => {
    const normalizedEin = taxForm.ein.trim()
    const normalizedTaxId = taxForm.taxId.trim()
    const normalizedRate = taxForm.salesTaxRate.trim()

    if (normalizedEin && !/^\d{2}-?\d{7}$/.test(normalizedEin)) {
      toast.error('Validation Failed', {
        description: 'EIN must be 9 digits (format: 12-3456789)',
      })
      return
    }

    if (normalizedRate.length > 0) {
      const parsedPercent = Number(normalizedRate)
      if (Number.isNaN(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
        toast.error('Validation Failed', {
          description: 'Sales tax rate must be between 0 and 100.',
        })
        return
      }
    }

    setIsSavingTax(true)
    try {
      const parsedPercent = normalizedRate.length > 0 ? Number(normalizedRate) : null
      const result = await UpdateLocation(location.id, {
        ein: normalizedEin || null,
        tax_id: normalizedTaxId || null,
        sales_tax_rate: parsedPercent !== null ? parsedPercent / 100 : null,
        tax_registration_status: taxForm.taxRegistrationStatus,
      })

      if (result.error) {
        toast.error('Update Failed', { description: result.error })
        return
      }

      if (result.data) {
        setViewLocation(result.data as Location)
      }

      toast.success('Tax settings updated')
      queryClient.invalidateQueries({ queryKey: ['locations'] })
      onUpdated?.()
      setShowTaxDialog(false)
    } catch (_error) {
      toast.error('Update Failed', { description: 'An unexpected error occurred' })
    } finally {
      setIsSavingTax(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Tax & Compliance
          </CardTitle>
          <CardDescription>
            Manage location EIN, tax registration, and sales tax rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">EIN</p>
              <p className="font-medium">{maskedEin}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">State Tax ID</p>
              <p className="font-medium">{viewLocation.tax_id || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sales Tax Rate</p>
              <p className="font-medium">{salesTaxRateDisplay}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Registration Status</p>
              <Badge
                variant={viewLocation.tax_registration_status ? 'default' : 'secondary'}
                className={cn(taxStatusClass)}
              >
                {viewLocation.tax_registration_status || 'pending'}
              </Badge>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowTaxDialog(true)}>
              Edit Tax Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showTaxDialog} onOpenChange={setShowTaxDialog}>
        <DialogContent elevation="above-sheet">
          <DialogHeader>
            <DialogTitle>Edit Tax & Compliance</DialogTitle>
            <DialogDescription>
              Update EIN, tax registration details, and sales tax rate for this location.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tax-ein">EIN</Label>
              <Input
                id="tax-ein"
                placeholder="12-3456789"
                value={taxForm.ein}
                onChange={(e) => setTaxForm((prev) => ({ ...prev, ein: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Stored securely. Display uses last 4 digits only.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax-id">State Tax ID</Label>
              <Input
                id="tax-id"
                placeholder="NY-12345678"
                value={taxForm.taxId}
                onChange={(e) => setTaxForm((prev) => ({ ...prev, taxId: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sales-tax-rate">Sales Tax Rate (%)</Label>
              <Input
                id="sales-tax-rate"
                type="number"
                step="0.0001"
                min="0"
                max="100"
                placeholder="8.75"
                value={taxForm.salesTaxRate}
                onChange={(e) => setTaxForm((prev) => ({ ...prev, salesTaxRate: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Tax Registration Status</Label>
              <Select
                value={taxForm.taxRegistrationStatus}
                onValueChange={(value: TaxRegistrationStatus) =>
                  setTaxForm((prev) => ({ ...prev, taxRegistrationStatus: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tax status" />
                </SelectTrigger>
                <SelectContent className="z-[220]">
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="verified">Verified</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaxDialog(false)} disabled={isSavingTax}>
              Cancel
            </Button>
            <Button onClick={handleSaveTaxCompliance} disabled={isSavingTax}>
              {isSavingTax ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Tax Settings'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
