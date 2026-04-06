'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Download, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ManualAdjustmentDialog } from '@/app/dashboard/tips/components/ManualAdjustmentDialog'
import { TipDateShiftSelector } from '@/app/dashboard/tips/components/TipDateShiftSelector'
import { TipDistributionTable } from '@/app/dashboard/tips/components/TipDistributionTable'
import { TipHistorySection } from '@/app/dashboard/tips/components/TipHistorySection'
import { TipSummaryCard } from '@/app/dashboard/tips/components/TipSummaryCard'
import type { TipDetailWithStaff } from '@/app/dashboard/actions/tips'
import type { LocationSummary } from '@/types/merchant'
import {
  useAdminApproveTipDistribution,
  useAdminCalculateTipDistribution,
  useAdminTipDistributionHistory,
  useAdminTipDistributionSession,
  useAdminTipManualAdjustment,
} from '@/lib/queries/use-admin-financial'

interface TipsTabProps {
  merchantId: string
  locations: LocationSummary[]
}

export function TipsTab({ merchantId, locations }: TipsTabProps) {
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [sessionDate, setSessionDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [shiftPeriod, setShiftPeriod] = useState<'full_day' | 'lunch' | 'dinner' | 'custom'>(
    'full_day'
  )
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false)
  const [adjustingDetail, setAdjustingDetail] = useState<TipDetailWithStaff | null>(null)
  const [showRecalculateWarning, setShowRecalculateWarning] = useState(false)

  useEffect(() => {
    if (!selectedLocationId && locations.length > 0) {
      setSelectedLocationId(locations[0].id)
    }
  }, [locations, selectedLocationId])

  const { data: session, isLoading: sessionLoading } = useAdminTipDistributionSession(
    merchantId,
    selectedLocationId || undefined,
    sessionDate,
    shiftPeriod
  )
  const { data: history = [], isLoading: historyLoading } = useAdminTipDistributionHistory(
    merchantId,
    selectedLocationId || undefined
  )

  const calculateMutation = useAdminCalculateTipDistribution()
  const approveMutation = useAdminApproveTipDistribution()
  const adjustMutation = useAdminTipManualAdjustment()

  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) || null

  const handleCalculate = () => {
    if (!selectedLocationId) return

    if (session?.status === 'approved') {
      setShowRecalculateWarning(true)
      return
    }

    calculateMutation.mutate({
      merchantId,
      locationId: selectedLocationId,
      sessionDate,
      shiftPeriod,
    })
  }

  const handleRecalculate = () => {
    if (!selectedLocationId) return

    setShowRecalculateWarning(false)
    calculateMutation.mutate({
      merchantId,
      locationId: selectedLocationId,
      sessionDate,
      shiftPeriod,
    })
  }

  const handleApprove = () => {
    if (!session) return

    approveMutation.mutate({
      merchantId,
      sessionId: session.id,
    })
  }

  const handleAdjust = (detail: TipDetailWithStaff) => {
    setAdjustingDetail(detail)
    setIsAdjustDialogOpen(true)
  }

  const handleSubmitAdjustment = (detailId: string, amount: number, reason: string) => {
    adjustMutation.mutate({
      merchantId,
      detailId,
      amount: amount * 100,
      reason,
    })
  }

  const handleExport = () => {
    if (!session) return

    const headers = [
      'Employee',
      'Role',
      'Hours',
      'Own Tips',
      'Pool In',
      'Pool Out',
      'Tip-Out In',
      'Tip-Out Out',
      'Adjustment',
      'Net Tips',
    ]

    const rows = session.tip_distribution_details.map((detail) => [
      detail.staff_profiles.display_name ||
        `${detail.staff_profiles.first_name} ${detail.staff_profiles.last_name}`,
      detail.role_code,
      (detail.hours_worked || 0).toFixed(1),
      `$${(detail.individual_tips_earned / 100).toFixed(2)}`,
      `$${(detail.tip_pool_received / 100).toFixed(2)}`,
      `$${(detail.tip_pool_contributed / 100).toFixed(2)}`,
      `$${(detail.tip_out_received / 100).toFixed(2)}`,
      `$${(detail.tip_out_given / 100).toFixed(2)}`,
      `$${(detail.manual_adjustment / 100).toFixed(2)}`,
      `$${(detail.net_tips / 100).toFixed(2)}`,
    ])

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `tip-distribution-${sessionDate}-${shiftPeriod}.csv`
    document.body.appendChild(link)
    link.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(link)
  }

  const handleSelectHistory = (historyDate: string, historyShift: string) => {
    setSessionDate(historyDate)
    setShiftPeriod(historyShift as 'full_day' | 'lunch' | 'dinner' | 'custom')
  }

  if (locations.length === 0) {
    return (
      <Card className="border-yellow-200 bg-yellow-50 p-6">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-5 w-5 text-yellow-600" />
          <div>
            <h3 className="font-semibold text-yellow-900">No locations found</h3>
            <p className="mt-1 text-sm text-yellow-800">
              Tip distribution is location-specific. Add a merchant location before managing tips.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tip Distribution</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Calculate and manage distributed tips for{' '}
            <span className="font-medium text-foreground">
              {selectedLocation?.name || 'this location'}
            </span>
            .
          </p>
        </div>

        <div className="w-full lg:w-64">
          <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Select location" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <TipDateShiftSelector
        date={sessionDate}
        shiftPeriod={shiftPeriod}
        onDateChange={setSessionDate}
        onShiftChange={(shift) => setShiftPeriod(shift as typeof shiftPeriod)}
      />

      <div className="flex flex-col gap-4">
        <TipSummaryCard session={session || null} isLoading={sessionLoading} />

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleCalculate}
            disabled={calculateMutation.isPending || !selectedLocationId}
            size="lg"
          >
            {calculateMutation.isPending ? 'Calculating...' : 'Calculate Tips'}
          </Button>

          {session?.status === 'calculated' && (
            <Button
              onClick={handleApprove}
              variant="default"
              disabled={approveMutation.isPending}
              size="lg"
            >
              {approveMutation.isPending ? 'Approving...' : 'Approve Distribution'}
            </Button>
          )}

          {session?.status === 'approved' && (
            <Button onClick={handleExport} variant="outline" size="lg">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {session && (
        <TipDistributionTable
          details={session.tip_distribution_details || []}
          sessionStatus={session.status}
          onAdjust={handleAdjust}
          isLoading={sessionLoading}
        />
      )}

      <TipHistorySection
        sessions={history}
        onSelectSession={handleSelectHistory}
        isLoading={historyLoading}
      />

      <ManualAdjustmentDialog
        open={isAdjustDialogOpen}
        onOpenChange={setIsAdjustDialogOpen}
        detail={adjustingDetail}
        onSubmit={handleSubmitAdjustment}
        isLoading={adjustMutation.isPending}
      />

      <AlertDialog open={showRecalculateWarning} onOpenChange={setShowRecalculateWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate approved distribution?</AlertDialogTitle>
            <AlertDialogDescription>
              This distribution has already been approved. Recalculating will remove the approval
              status. Continue only if you need to recompute the final numbers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecalculate}>
              Yes, recalculate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
