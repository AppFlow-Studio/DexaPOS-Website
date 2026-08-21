import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const isNativeDateLike =
    type === "date" || type === "time" || type === "datetime-local"

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Filled pill by default (DS-CTL-02): muted fill, no border or shadow, and
        // the fill drops away on focus. Call sites that need a squarer field
        // (e.g. a segmented/grouped input) override with their own `rounded-*`.
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground h-9 w-full min-w-0 rounded-full border-0 bg-muted/60 px-4 py-1 text-base shadow-none transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:bg-background focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        // The fill alone can't carry an error state, so an invalid field re-gains a
        // destructive border on top of the ring.
        "aria-invalid:border aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        isNativeDateLike && "dark:[color-scheme:dark] [color-scheme:light]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
