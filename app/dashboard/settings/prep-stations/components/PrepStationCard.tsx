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
  onEdit: (station: PrepStationWithCount) => void;
  onDelete: (station: PrepStationWithCount) => void;
  onToggleActive: (station: PrepStationWithCount) => void;
}

export function PrepStationCard({
  station,
  onEdit,
  onDelete,
  onToggleActive,
}: PrepStationCardProps) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-3">
        {/* Color swatch */}
        <div
          className="h-8 w-8 rounded-full border-2 border-background shadow-sm flex-shrink-0"
          style={{ backgroundColor: station.color }}
        />

        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{station.name}</span>
            {station.item_count > 0 && (
              <Badge variant="secondary" className="text-xs">
                {station.item_count} item{station.item_count !== 1 ? "s" : ""}
              </Badge>
            )}
            {!station.is_active && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Inactive
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={station.is_active}
          onCheckedChange={() => onToggleActive(station)}
          aria-label={`Toggle ${station.name} active`}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
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
