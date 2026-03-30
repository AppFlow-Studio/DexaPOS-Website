"use client";

import { Site } from "@/types/site";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Info } from "lucide-react";
import { InfoPanel } from "./InfoPanel";
import { ScrollArea } from "@/components/ui/scroll-area";

interface InfoSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  site: Site | null;
  location: {
    id: string;
    name: string;
    address_line1: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    email: string | null;
    business_hours: any;
  };
}

export function InfoSheet({
  isOpen,
  onOpenChange,
  site,
  location,
}: InfoSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-md flex flex-col p-0 !bg-white"
        style={{ backgroundColor: "#ffffff" }}
      >
        <SheetHeader className="p-6 border-b bg-gradient-to-r from-blue-500/10 to-violet-500/10">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-white shadow-lg">
              <Info className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">Store Information</span>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <InfoPanel site={site} location={location} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
