"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { type PrepStationWithCount } from "@/app/dashboard/hooks/usePrepStations";

interface PrepStationCardProps {
  station: PrepStationWithCount;
  assignedCategories: string[];
  onEdit: (station: PrepStationWithCount) => void;
  onDelete: (station: PrepStationWithCount) => void;
  onToggleActive: (station: PrepStationWithCount) => void;
}

export function PrepStationCard({
  station,
  assignedCategories,
  onEdit,
  onDelete,
  onToggleActive,
}: PrepStationCardProps) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 rounded-2xl border-0 bg-muted/45 p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* The swatch is functional colour encoding (§4.6b exception 2) — it is
            the station's identity on the KDS, not a status hue. */}
        <div
          className="mt-0.5 h-8 w-8 shrink-0 rounded-full"
          style={{ backgroundColor: station.color }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{station.name}</span>
            {station.item_count > 0 && (
              <Badge
                variant="secondary"
                className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium tabular-nums"
              >
                {station.item_count} item{station.item_count !== 1 ? "s" : ""}
              </Badge>
            )}
            {!station.is_active && (
              <Badge className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Categories:</span>
            {assignedCategories.length === 0 ? (
              <span className="text-xs italic text-muted-foreground">
                None assigned
              </span>
            ) : (
              assignedCategories.map((name) => (
                <Badge
                  key={name}
                  className="w-fit rounded-full border-0 bg-muted/60 px-2.5 text-xs font-medium"
                >
                  {name}
                </Badge>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Switch
          checked={station.is_active}
          onCheckedChange={() => onToggleActive(station)}
          aria-label={`Toggle ${station.name} active`}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(station)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(station)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
