"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClipboardList } from "lucide-react";
import { OrdersPanel } from "./OrdersPanel";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrdersSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  storeConfigId?: string;
}

export function OrdersSheet({ isOpen, onOpenChange, slug, storeConfigId }: OrdersSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-md flex flex-col p-0"
        style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
      >
        <SheetHeader
          className="p-6 border-b"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <SheetTitle className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-text)" }}
            >
              <ClipboardList className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold" style={{ color: "var(--text)" }}>Order History</span>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <OrdersPanel slug={slug} storeConfigId={storeConfigId} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
