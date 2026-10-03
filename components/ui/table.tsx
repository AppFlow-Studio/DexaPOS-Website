"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type TableProps = React.ComponentProps<"table"> & {
  containerClassName?: string
  variant?: "default" | "data"
  /**
   * `data` only, on by default. Caps the table's height from `md` up and pins
   * its header, so a long table scrolls inside its own well instead of
   * stretching the page (UI-DESIGN-SYSTEM §5.7). Pass `false` when something
   * else already owns the scroll: a dialog body, a table nested in another
   * table's expanded row. A different cap goes on `containerClassName`
   * (`md:max-h-80`).
   */
  bounded?: boolean
}

const TableVariantContext = React.createContext<TableProps["variant"]>("default")
const TableBoundedContext = React.createContext(false)
/** How many columns the header shows right now; `null` until measured. */
const TableColumnCountContext = React.createContext<number | null>(null)

/**
 * Counts the columns the table's first header row actually shows. Tiered
 * columns (`hidden xl:table-cell`, UI-DESIGN-SYSTEM §5.3) drop out below
 * their breakpoint, so the count follows the viewport: it re-measures on
 * resize and whenever the header's cells, classes or styles change.
 */
function useVisibleColumnCount(tableRef: React.RefObject<HTMLTableElement | null>) {
  const [count, setCount] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return

    const measure = () => {
      const row = table.querySelector(":scope > thead > tr")
      if (!row) return setCount(null)
      let visible = 0
      for (const cell of Array.from(row.children)) {
        if (getComputedStyle(cell).display === "none") continue
        visible += Number(cell.getAttribute("colspan")) || 1
      }
      setCount(visible > 0 ? visible : null)
    }

    measure()
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure)
    resize?.observe(table)
    const mutation = new MutationObserver(measure)
    const head = table.querySelector(":scope > thead")
    if (head) {
      mutation.observe(head, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "style", "colspan"],
      })
    }
    return () => {
      resize?.disconnect()
      mutation.disconnect()
    }
  }, [tableRef])

  return count
}

function Table({
  className,
  containerClassName,
  variant = "default",
  bounded = true,
  ...props
}: TableProps) {
  const isBounded = variant === "data" && bounded
  const tableRef = React.useRef<HTMLTableElement>(null)
  const columnCount = useVisibleColumnCount(tableRef)

  return (
    <TableVariantContext.Provider value={variant}>
      <TableBoundedContext.Provider value={isBounded}>
        <TableColumnCountContext.Provider value={columnCount}>
          <div
            data-slot="table-container"
            data-variant={variant}
            className={cn(
              // Keep the table width constrained while allowing horizontal scroll when
              // content or expanded rows are wider than the viewport.
              "relative w-full min-w-0 overflow-x-auto",
              variant === "data" && "overflow-x-auto overflow-y-hidden rounded-2xl bg-muted/20",
              // The container is the scroller, so the header can stick to it. Not
              // below `md`: phone tables are paged or become cards, and a nested
              // scroll area on touch traps the thumb. Print at full height.
              isBounded &&
                "thin-scrollbar md:max-h-[min(70vh,40rem)] md:overflow-y-auto print:max-h-none print:overflow-visible",
              containerClassName
            )}
          >
            <table
              ref={tableRef}
              data-slot="table"
              className={cn(
                "w-full caption-bottom text-sm",
                variant === "data" && "[&_td]:px-3 [&_td]:py-3 [&_th]:px-3",
                className
              )}
              {...props}
            />
          </div>
        </TableColumnCountContext.Provider>
      </TableBoundedContext.Provider>
    </TableVariantContext.Provider>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  const variant = React.useContext(TableVariantContext)
  const bounded = React.useContext(TableBoundedContext)

  return (
    <thead
      data-slot="table-header"
      className={cn(
        // A data table's header is set apart by its fill, never a rule
        // (UI-DESIGN-SYSTEM §5.5). `border-0`, not just dropping `border-b`:
        // every `TableRow` carries its own `border-b`, so the line survives
        // unless the header clears it.
        variant === "data" ? "bg-muted/50 [&_tr]:border-0" : "[&_tr]:border-b",
        // A sticky header needs an opaque fill or rows show through it: the
        // card goes on the <thead> and the muted band moves onto its row, so
        // the header looks the same as an unpinned one.
        bounded && "sticky top-0 z-10 bg-card [&_tr]:bg-muted/50 print:static",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  const variant = React.useContext(TableVariantContext)

  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_tr:last-child]:border-0",
        variant === "data" &&
          "[&_tr]:border-0 [&_tr]:bg-card/70 [&_tr:hover]:bg-muted/40",
        className
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 ",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, colSpan, ...props }: React.ComponentProps<"td">) {
  // A full-width row spans every column (`colSpan={columns.length}`), but tiered
  // columns hide below their breakpoint (§5.3). A span wider than the visible
  // header makes the browser add an anonymous column that takes a share of a
  // `table-fixed` table's width, so the header band stops short of the edge.
  // Clamp the span to what the header shows; a span that fits is untouched.
  const columnCount = React.useContext(TableColumnCountContext)
  const span =
    colSpan !== undefined && columnCount !== null && colSpan > columnCount
      ? columnCount
      : colSpan

  return (
    <td
      data-slot="table-cell"
      colSpan={span}
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 ",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
