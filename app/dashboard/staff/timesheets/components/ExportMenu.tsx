"use client";

import { ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExportMenu({
  disabled,
  onExport,
}: {
  disabled: boolean;
  onExport: (kind: "summary" | "shifts") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className="h-9 gap-2 rounded-full px-4 text-[0.8125rem] font-medium shadow-sm"
        >
          <Download className="h-4 w-4" />
          Export
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={() => onExport("summary")} className="justify-between gap-3">
          <span>Summary</span>
          <span className="text-xs text-muted-foreground">CSV · as shown</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("shifts")} className="justify-between gap-3">
          <span>Shift detail</span>
          <span className="text-xs text-muted-foreground">CSV · one row per shift</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
