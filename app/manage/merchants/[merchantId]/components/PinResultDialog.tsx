'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { AlertTriangle, Copy, CheckCircle, Key } from 'lucide-react'

interface PinResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staffName: string
  pin: string
}

export function PinResultDialog({
  open,
  onOpenChange,
  staffName,
  pin,
}: PinResultDialogProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pin)
      setCopied(true)
      toast.success('PIN copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy PIN')
    }
  }

  const handleClose = () => {
    setCopied(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-green-500" />
            PIN Generated
          </DialogTitle>
          <DialogDescription>
            New PIN for {staffName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* PIN Display */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full">
              <div className="bg-muted rounded-lg p-6 text-center">
                <p className="font-mono text-4xl font-bold tracking-[0.5em] text-foreground">
                  {pin}
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2"
                onClick={handleCopy}
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Warning */}
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This PIN will only be displayed once. Make sure to save it or share
              it with the staff member before closing this dialog.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} className="w-full">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
