'use client'

import { useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LineItemRow, type LineItem } from '@/app/dashboard/invoices/components/LineItemRow'
import type { PaymentDueType } from '@/app/dashboard/actions/invoices'
import {
  useCreatePlatformInvoice,
  useSendPlatformInvoice,
} from '@/lib/queries/use-admin-financial'

interface PlatformInvoiceDialogProps {
  merchantId: string
  locations: Array<{ id: string; name: string }>
  open: boolean
  onOpenChange: (open: boolean) => void
}

const DUE_OPTIONS: Array<{ value: PaymentDueType; label: string }> = [
  { value: 'upon_receipt', label: 'Upon Receipt' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_60', label: 'Net 60' },
  { value: 'custom', label: 'Custom date' },
]

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function PlatformInvoiceDialog({
  merchantId,
  locations,
  open,
  onOpenChange,
}: PlatformInvoiceDialogProps) {
  const [items, setItems] = useState<LineItem[]>([])
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('1')
  const [newPrice, setNewPrice] = useState('')
  const [paymentDueType, setPaymentDueType] = useState<PaymentDueType>('upon_receipt')
  const [dueDate, setDueDate] = useState('')
  const [discount, setDiscount] = useState('')
  const [taxRate, setTaxRate] = useState('')
  const [note, setNote] = useState('')
  const [locationId, setLocationId] = useState<string>('none')
  const [overrideEmail, setOverrideEmail] = useState('')

  const createBill = useCreatePlatformInvoice(merchantId)
  const sendBill = useSendPlatformInvoice(merchantId)

  const { subtotal, discountAmount, taxAmount, total } = useMemo(() => {
    const sub = round2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0))
    const disc = round2(Math.min(parseFloat(discount) || 0, sub))
    const rate = parseFloat(taxRate) || 0
    const tax = round2(((sub - disc) * rate) / 100)
    return {
      subtotal: sub,
      discountAmount: disc,
      taxAmount: tax,
      total: round2(sub - disc + tax),
    }
  }, [items, discount, taxRate])

  const busy = createBill.isPending || sendBill.isPending
  const canSubmit =
    items.length > 0 && !busy && (paymentDueType !== 'custom' || !!dueDate)

  function reset() {
    setItems([])
    setNewName('')
    setNewQty('1')
    setNewPrice('')
    setPaymentDueType('upon_receipt')
    setDueDate('')
    setDiscount('')
    setTaxRate('')
    setNote('')
    setLocationId('none')
    setOverrideEmail('')
  }

  function addItem() {
    const name = newName.trim()
    const qty = parseFloat(newQty) || 0
    const price = parseFloat(newPrice) || 0
    if (!name || qty <= 0) return
    setItems((prev) => [
      ...prev,
      { id: uuidv4(), name, quantity: qty, unit_price: price },
    ])
    setNewName('')
    setNewQty('1')
    setNewPrice('')
  }

  function updateItem(id: string, field: keyof LineItem, value: string | number) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    )
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function buildInput() {
    return {
      location_id: locationId === 'none' ? null : locationId,
      payment_due_type: paymentDueType,
      due_date: paymentDueType === 'custom' && dueDate ? dueDate : null,
      subtotal,
      discount_amount: discountAmount,
      tax_rate: parseFloat(taxRate) || 0,
      tax_amount: taxAmount,
      total_amount: total,
      note: note.trim() || null,
      items: items.map((i, idx) => ({
        name: i.name,
        description: i.description ?? null,
        quantity: i.quantity,
        unit_price: i.unit_price,
        sort_order: idx,
      })),
    }
  }

  async function handleCreate(send: boolean) {
    const result = await createBill.mutateAsync(buildInput())
    if (result.error && !result.data) return
    if (send && result.data) {
      await sendBill.mutateAsync({
        invoiceId: result.data.id,
        channels: ['email'],
        email: overrideEmail.trim() || undefined,
      })
    }
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New bill to merchant</DialogTitle>
          <DialogDescription>
            Dexa POS bills this merchant. They receive a pay link by email and can
            pay it online.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Line items */}
          <div className="space-y-1">
            <Label>Line items</Label>
            {items.length > 0 && (
              <div className="rounded-md border px-3">
                {items.map((item) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    onChange={updateItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}
            <div className="grid grid-cols-[1fr_70px_90px_auto] items-end gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Hardware setup"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addItem()
                    }
                  }}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Qty</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="h-8 text-center"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Unit price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0.00"
                  className="h-8 text-right"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={addItem}
                aria-label="Add line item"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Location + due terms */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Location (optional)</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Merchant-wide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Merchant-wide</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Payment due</Label>
              <Select
                value={paymentDueType}
                onValueChange={(v) => setPaymentDueType(v as PaymentDueType)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DUE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {paymentDueType === 'custom' && (
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9"
              />
            </div>
          )}

          {/* Discount + tax */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Discount ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0.00"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label>Tax rate (%)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="0"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Shown to the merchant on the invoice."
            />
          </div>

          <div className="space-y-1">
            <Label>Send to (optional)</Label>
            <Input
              type="email"
              value={overrideEmail}
              onChange={(e) => setOverrideEmail(e.target.value)}
              placeholder="Defaults to the merchant billing email"
              className="h-9"
            />
          </div>

          {/* Totals */}
          <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">${subtotal.toFixed(2)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount</span>
                <span className="tabular-nums">-${discountAmount.toFixed(2)}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">${taxAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleCreate(false)}
            disabled={!canSubmit}
          >
            Save draft
          </Button>
          <Button onClick={() => handleCreate(true)} disabled={!canSubmit}>
            Save &amp; Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
