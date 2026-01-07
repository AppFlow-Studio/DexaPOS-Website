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
}

export function OrdersSheet({ isOpen, onOpenChange }: OrdersSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-6 border-b bg-gradient-to-r from-amber-500/10 to-orange-500/10">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg">
              <ClipboardList className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">Your Orders</span>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <OrdersPanel />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
