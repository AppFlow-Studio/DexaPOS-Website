'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/*
 * The editor pop-up every billing catalog record opens in (UI-DESIGN-SYSTEM
 * §12): centred and rounded, full-screen below `sm` (§13.1). The content
 * clips and only the body scrolls, so the header and footer need no rule
 * (§5.5).
 *
 * ⚠️ Classes are literal strings in this .tsx on purpose (C7).
 */

/** Changes are forward-only; every editor says so where a phone still shows it. */
export const FORWARD_ONLY_NOTE =
  'Changes apply to future billing. Invoices already issued keep their prices.'

export function CatalogFormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  submitLabel,
  submitDisabled,
  pending,
  onSubmit,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  submitLabel: string
  submitDisabled?: boolean
  pending: boolean
  onSubmit: () => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent
        className={cn(
          'flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:w-full sm:rounded-3xl',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl'
        )}
      >
        <DialogHeader className="shrink-0 px-6 pb-2 pt-6 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (!submitDisabled && !pending) onSubmit()
          }}
        >
          <div className="thin-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
            {children}
          </div>

          {/* 44px targets on phones (§13.6). Busy is a label, never a spinner (§4.10). */}
          <DialogFooter className="shrink-0 px-6 pb-6 pt-2">
            <Button
              type="button"
              variant="outline"
              className="max-sm:h-11"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-11" disabled={submitDisabled || pending}>
              {pending ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A group of fields under a quiet heading; groups are separated by spacing, not rules (§5.5). */
export function FormGroup({
  title,
  children,
  columns = 2,
}: {
  title: string
  children: React.ReactNode
  columns?: 1 | 2
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className={cn('grid gap-4', columns === 2 && 'sm:grid-cols-2')}>{children}</div>
    </section>
  )
}

export function FormField({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string
  label: string
  hint?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * A number field with a `$` or `%` affix inside the pill. The affix is
 * text, not colour, so the unit reads without the label.
 */
export function AffixedNumberInput({
  id,
  affix,
  position,
  className,
  ...inputProps
}: Omit<React.ComponentProps<typeof Input>, 'type'> & {
  id: string
  affix: string
  position: 'start' | 'end'
}) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-muted-foreground',
          position === 'start' ? 'left-4' : 'right-4'
        )}
      >
        {affix}
      </span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        className={cn('tabular-nums', position === 'start' ? 'pl-8' : 'pr-9', className)}
        {...inputProps}
      />
    </div>
  )
}

/**
 * A select trigger on the muted, borderless field material (§4.2).
 * `SelectTrigger` still ships a border and a transparent fill (§11), so the
 * material is spelled out here until the primitive carries it.
 */
export function MutedSelectTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn(
        'w-full min-w-0 border-0 bg-muted/60 shadow-none hover:bg-muted dark:bg-muted/60 dark:hover:bg-muted',
        className
      )}
      {...props}
    />
  )
}

/**
 * Active / Inactive as a word in a select. A switch or checkbox would render
 * its checked state in `--primary`, which is violet inside a dialog portal
 * (C5); the state is a word, never a hue (§4.6b).
 */
export function StatusSelect({
  id,
  isActive,
  onChange,
}: {
  id: string
  isActive: boolean
  onChange: (isActive: boolean) => void
}) {
  return (
    <Select value={isActive ? 'active' : 'inactive'} onValueChange={(value) => onChange(value === 'active')}>
      <MutedSelectTrigger id={id}>
        <SelectValue />
      </MutedSelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="inactive">Inactive</SelectItem>
      </SelectContent>
    </Select>
  )
}
