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
    <div className="flex items-start justify-between p-4 border rounded-lg bg-card gap-4">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {/* Color swatch */}
        <div
          className="h-8 w-8 rounded-full border-2 border-background shadow-sm flex-shrink-0 mt-0.5"
          style={{ backgroundColor: station.color }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
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
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-muted-foreground">Categories:</span>
            {assignedCategories.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">
                None assigned
              </span>
            ) : (
              assignedCategories.map((name) => (
                <Badge key={name} variant="outline" className="text-xs">
                  {name}
                </Badge>
              ))
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
