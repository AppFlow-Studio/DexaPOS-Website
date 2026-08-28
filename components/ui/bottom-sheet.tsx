"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon, GripHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface BottomSheetContextValue {
    level: number
}

const BottomSheetContext = React.createContext<BottomSheetContextValue>({ level: 0 })

// Minimum nesting level that yields a z-index clearing a right-side Sheet
// (overlay z-[199] / content z-[200] in components/ui/sheet.tsx).
// level 12 → overlay 210, content 211.
const ELEVATED_MIN_LEVEL = 12

function BottomSheet({
    children,
    elevated,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Root> & {
    /**
     * Render above a parent Sheet/Dialog (z-[200]). Use when a bottom sheet is
     * opened from inside a Sheet (e.g. order detail from Customer Profile), so
     * it paints in the foreground instead of behind the dimmed sheet.
     */
    elevated?: boolean
}) {
    const parentContext = React.useContext(BottomSheetContext)
    let level = parentContext.level + 1
    if (elevated && level < ELEVATED_MIN_LEVEL) level = ELEVATED_MIN_LEVEL

    return (
        <BottomSheetContext.Provider value={{ level }}>
            <DialogPrimitive.Root data-slot="bottom-sheet" {...props}>
                {children}
            </DialogPrimitive.Root>
        </BottomSheetContext.Provider>
    )
}

function BottomSheetTrigger({
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
    return <DialogPrimitive.Trigger data-slot="bottom-sheet-trigger" {...props} />
}

function BottomSheetClose({
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
    return <DialogPrimitive.Close data-slot="bottom-sheet-close" {...props} />
}

function BottomSheetPortal({
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
    return <DialogPrimitive.Portal data-slot="bottom-sheet-portal" {...props} />
}

function BottomSheetOverlay({
    className,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
    const { level } = React.useContext(BottomSheetContext)

    return (
        <DialogPrimitive.Overlay
            data-slot="bottom-sheet-overlay"
            className={cn(
                "fixed inset-0 bg-black/60 backdrop-blur-sm",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                "duration-300 ease-out",
                className
            )}
            style={{ zIndex: 100 + (level - 1) * 10 }}
            {...props}
        />
    )
}

interface BottomSheetContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
    showDragHandle?: boolean
    height?: "auto" | "full" | "95"
    overlayClassName?: string
}

function BottomSheetContent({
    className,
    children,
    showDragHandle = true,
    height = "95",
    overlayClassName,
    ...props
}: BottomSheetContentProps) {
    const { level } = React.useContext(BottomSheetContext)

    const heightClasses = {
        auto: "h-auto max-h-[95dvh]",
        full: "h-full",
        "95": "h-[95dvh]",
    }

    return (
        <BottomSheetPortal>
            <BottomSheetOverlay className={overlayClassName} />
            <DialogPrimitive.Content
                data-slot="bottom-sheet-content"
                className={cn(
                    "fixed inset-x-0 bottom-0 bg-background flex flex-col shadow-2xl",
                    "rounded-t-[20px] border-t border-x",
                    heightClasses[height],
                    // Animations
                    "data-[state=open]:animate-in data-[state=closed]:animate-out",
                    "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                    "data-[state=closed]:duration-300 data-[state=open]:duration-500",
                    "ease-out",
                    // Nested sheet scale effect
                    level > 1 && "data-[state=open]:scale-100",
                    className
                )}
                style={{ zIndex: 100 + (level - 1) * 10 + 1 }}
                {...props}
            >
                {/* Drag Handle */}
                {showDragHandle && (
                    <div className="flex shrink-0 justify-center pt-3 pb-1">
                        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
                    </div>
                )}

                {children}

                {/* Close Button */}
                <DialogPrimitive.Close className="absolute top-4 right-4 rounded-full p-2 bg-muted/80 hover:bg-muted opacity-70 transition-all hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none disabled:pointer-events-none z-10">
                    <XIcon className="size-5" />
                    <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </BottomSheetPortal>
    )
}

function BottomSheetHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="bottom-sheet-header"
            className={cn("flex flex-col gap-1.5 px-6 pt-2 pb-4 border-b shrink-0", className)}
            {...props}
        />
    )
}

function BottomSheetBody({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="bottom-sheet-body"
            className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-4", className)}
            {...props}
        />
    )
}

function BottomSheetFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="bottom-sheet-footer"
            className={cn("flex items-center gap-3 px-6 py-4 border-t shrink-0 bg-background", className)}
            {...props}
        />
    )
}

function BottomSheetTitle({
    className,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
    return (
        <DialogPrimitive.Title
            data-slot="bottom-sheet-title"
            className={cn("text-xl font-semibold text-foreground", className)}
            {...props}
        />
    )
}

function BottomSheetDescription({
    className,
    ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
    return (
        <DialogPrimitive.Description
            data-slot="bottom-sheet-description"
            className={cn("text-muted-foreground text-sm", className)}
            {...props}
        />
    )
}

// Section component for organizing form content
function BottomSheetSection({
    className,
    title,
    children,
    ...props
}: React.ComponentProps<"div"> & { title?: string }) {
    return (
        <div
            data-slot="bottom-sheet-section"
            className={cn("space-y-3", className)}
            {...props}
        >
            {title && (
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {title}
                </h3>
            )}
            {children}
        </div>
    )
}

export {
    BottomSheet,
    BottomSheetTrigger,
    BottomSheetClose,
    BottomSheetContent,
    BottomSheetHeader,
    BottomSheetBody,
    BottomSheetFooter,
    BottomSheetTitle,
    BottomSheetDescription,
    BottomSheetSection,
}

