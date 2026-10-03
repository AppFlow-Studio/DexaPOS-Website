'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import {
  isAnnotationKey,
  isIdentifier,
  isPlainObject,
  isZonedTimestamp,
  itemTitle,
  partitionObject,
  type PayloadField,
  type PayloadNode,
  type PlainObject,
  type Scalar,
} from './payload-format'
import { isStrippedOnReplay } from './replay'

/*
 * The detail panel's view of a dead-letter payload: labelled fields by
 * default, the exact JSON one tab away. Payloads come from several writers,
 * so the layout follows the object, not a known shape. Neutral throughout —
 * a payload is data, not an alarm (§3.5).
 *
 * Classes are literal in this .tsx on purpose (C7).
 */

/** Below this depth a branch reads as compact JSON rather than more sections. */
const MAX_DEPTH = 4

/** Values longer than this take the full row instead of half of it. */
const WIDE_VALUE = 40

function formatScalar(value: Scalar): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (isZonedTimestamp(value)) return format(new Date(value), 'MMM d, yyyy h:mm:ss a')
  return String(value)
}

function FieldValue({ field }: { field: PayloadField }) {
  if (Array.isArray(field.value)) {
    return <>{field.value.map(formatScalar).join(', ')}</>
  }
  const text = formatScalar(field.value)
  return (
    <span
      className={cn(isIdentifier(field.key, field.value) && 'font-mono text-xs font-normal')}
      // A reformatted timestamp keeps its exact source value on hover.
      title={text !== String(field.value) ? String(field.value) : undefined}
    >
      {text}
    </span>
  )
}

function isWide(field: PayloadField): boolean {
  const text = Array.isArray(field.value) ? field.value.join(', ') : String(field.value)
  return text.length > WIDE_VALUE || text.includes('\n')
}

function FieldGrid({ fields, note }: { fields: PayloadField[]; note?: (key: string) => string | null }) {
  if (fields.length === 0) return null
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
      {fields.map((field) => {
        const extra = note?.(field.key)
        return (
          <div key={field.key} className={cn('min-w-0', isWide(field) && 'sm:col-span-2')}>
            <dt className="text-xs text-muted-foreground" title={field.key}>
              {field.label}
              {extra && <span> · {extra}</span>}
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm font-medium tabular-nums">
              <FieldValue field={field} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** Null and blank values fold into one line, so they cost no space but stay visible. */
function EmptyLine({ empty }: { empty: PayloadNode['empty'] }) {
  if (empty.length === 0) return null
  return (
    <p className="text-xs text-muted-foreground" title={empty.map((e) => e.key).join(', ')}>
      Empty: {empty.map((e) => e.label).join(', ')}
    </p>
  )
}

/** A list of objects (line items, results, …): numbered, each named by its own `name`/`title`. */
function ItemList({ items, depth }: { items: PlainObject[]; depth: number }) {
  return (
    <ol className="space-y-4">
      {items.map((item, index) => {
        const title = itemTitle(item)
        return (
          <li key={index} className="min-w-0">
            <p className="mb-2 text-sm">
              <span className="text-muted-foreground tabular-nums">{index + 1}</span>
              {title && <span className="font-medium"> · {title}</span>}
            </p>
            <ObjectBody value={item} depth={depth + 1} />
          </li>
        )
      })}
    </ol>
  )
}

/**
 * One object's contents: its fields, then each nested section, then its empty
 * keys. `note` adds a word after a label at this level only.
 */
function ObjectBody({
  value,
  depth,
  note,
}: {
  value: PlainObject
  depth: number
  note?: (key: string) => string | null
}) {
  if (depth > MAX_DEPTH) {
    return (
      <pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    )
  }
  const node = partitionObject(value)
  return (
    <div className="space-y-4">
      <FieldGrid fields={node.fields} note={note} />
      {node.groups.map((group) => {
        const extra = note?.(group.key)
        return (
          <div key={group.key} className="min-w-0">
            <p className="text-[0.8125rem] font-medium" title={group.key}>
              {group.label}
              {Array.isArray(group.value) && (
                <span className="font-normal text-muted-foreground tabular-nums"> · {group.value.length}</span>
              )}
              {extra && <span className="font-normal text-muted-foreground"> · {extra}</span>}
            </p>
            {/* Nesting reads by indent and spacing, never by a rule (§5.5). */}
            <div className="mt-2 pl-3">
              {Array.isArray(group.value) ? (
                <ItemList items={group.value} depth={depth} />
              ) : (
                <ObjectBody value={group.value} depth={depth + 1} />
              )}
            </div>
          </div>
        )
      })}
      <EmptyLine empty={node.empty} />
    </div>
  )
}

/** A top-level block of the Fields view: the muted well the rest of the panel uses. */
function Well({ title, caption, children }: { title?: string; caption?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-muted/60 px-4 py-4">
      {title && <h3 className="text-sm font-medium">{title}</h3>}
      {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
      <div className={cn((title || caption) && 'mt-3')}>{children}</div>
    </section>
  )
}

function PayloadFields({ payload }: { payload: unknown }) {
  if (!isPlainObject(payload)) {
    return (
      <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        This payload has no named fields to lay out. The JSON view shows it as received.
      </p>
    )
  }

  const annotations: PlainObject = {}
  const body: PlainObject = {}
  for (const [key, value] of Object.entries(payload)) {
    if (isAnnotationKey(key)) annotations[key] = value
    else body[key] = value
  }

  const top = partitionObject(body)
  const hasTop = top.fields.length > 0 || top.empty.length > 0
  const hasNotes = Object.keys(annotations).length > 0

  return (
    <div className="space-y-3">
      {hasTop && (
        <Well>
          <div className="space-y-4">
            <FieldGrid fields={top.fields} />
            <EmptyLine empty={top.empty} />
          </div>
        </Well>
      )}

      {top.groups.map((group) => (
        <Well
          key={group.key}
          title={Array.isArray(group.value) ? `${group.label} · ${group.value.length}` : group.label}
        >
          {Array.isArray(group.value) ? (
            <ItemList items={group.value} depth={1} />
          ) : (
            <ObjectBody value={group.value} depth={1} />
          )}
        </Well>
      ))}

      {hasNotes && (
        <Well
          title="Added by Dexa"
          caption="Keys Dexa attached while processing the webhook. Those marked “removed on replay” are stripped before a retry re-sends the payload."
        >
          <ObjectBody
            value={annotations}
            depth={1}
            note={(key) => (isStrippedOnReplay(key) ? 'removed on replay' : null)}
          />
        </Well>
      )}
    </div>
  )
}

/** Fields first, JSON on demand; Copy always copies the exact JSON. */
export function PayloadView({ payload }: { payload: unknown }) {
  const json = useMemo(() => {
    try {
      return JSON.stringify(payload, null, 2) ?? String(payload)
    } catch {
      return String(payload)
    }
  }, [payload])

  function copyJson() {
    void navigator.clipboard.writeText(json).then(
      () => toast.success('Payload JSON copied'),
      () => toast.error('Could not copy the payload')
    )
  }

  return (
    <Tabs defaultValue="fields" className="min-w-0 gap-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Payload</p>
        <div className="flex items-center gap-1">
          <TabsList className="inline-flex h-auto w-max gap-0.5 rounded-full bg-muted/70 p-1">
            <TabsTrigger
              value="fields"
              className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
            >
              Fields
            </TabsTrigger>
            <TabsTrigger
              value="json"
              className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border"
            >
              JSON
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Copy payload JSON"
            className="h-8 shrink-0 gap-1.5 px-3 text-xs text-muted-foreground"
            onClick={copyJson}
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="max-sm:sr-only">Copy</span>
          </Button>
        </div>
      </div>

      <TabsContent value="fields" className="mt-0">
        <PayloadFields payload={payload} />
      </TabsContent>
      <TabsContent value="json" className="mt-0">
        {/* No inner height cap: the dialog body already scrolls, and a second
            scroll area inside it traps the wheel (§5.7). */}
        <pre className="thin-scrollbar overflow-x-auto rounded-2xl bg-muted/40 p-4 font-mono text-[11px] leading-relaxed">
          {json}
        </pre>
      </TabsContent>
    </Tabs>
  )
}
