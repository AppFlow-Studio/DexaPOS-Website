"use client";

import { useEffect, useState } from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { ClipboardList, X } from "lucide-react";
import { OrdersPanel } from "./OrdersPanel";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrdersSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  storeConfigId?: string;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

export function OrdersSheet({ isOpen, onOpenChange, slug, storeConfigId }: OrdersSheetProps) {
  const isDesktop = useIsDesktop();

  // Right-side drawer on desktop, bottom sheet on mobile/tablet (matches Cart).
  const contentStyle: React.CSSProperties = isDesktop
    ? {
        top: 0,
        right: 0,
        bottom: 0,
        left: "auto",
        width: "420px",
        maxWidth: "90vw",
        maxHeight: "100vh",
        backgroundColor: "var(--card)",
        borderRadius: "16px 0 0 16px",
        fontFamily: "var(--font)",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.15)",
      }
    : {
        bottom: 0,
        left: 0,
        right: 0,
        top: "auto",
        height: "85vh",
        backgroundColor: "var(--card)",
        borderRadius: "20px 20px 0 0",
        fontFamily: "var(--font)",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
      };

  return (
    <SheetPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay
          className="fixed inset-0 z-[60] transition-opacity duration-200 data-[state=open]:opacity-100 data-[state=closed]:opacity-0"
          style={{
            backgroundColor: isDesktop ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.5)",
            backdropFilter: isDesktop ? "none" : "blur(4px)",
          }}
        />
        <SheetPrimitive.Content
          aria-label="Order History"
          className={
            "fixed z-[70] flex flex-col overflow-hidden " +
            (isDesktop ? "cart-slide-right" : "cart-slide-bottom")
          }
          style={contentStyle}
        >
          {/* Drag handle — mobile only */}
          {!isDesktop && (
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: "var(--border)" }} />
            </div>
          )}

          <div
            className="p-6 border-b shrink-0"
            style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <SheetPrimitive.Title className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
                >
                  <ClipboardList className="h-5 w-5" />
                </div>
                <span className="text-xl font-bold" style={{ color: "var(--text)" }}>Order History</span>
              </SheetPrimitive.Title>
              <SheetPrimitive.Close
                className="p-2 rounded-xl transition-colors shrink-0"
                style={{
                  backgroundColor: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </SheetPrimitive.Close>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 p-6">
            <OrdersPanel slug={slug} storeConfigId={storeConfigId} />
          </ScrollArea>
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
