"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export interface ScheduleAssignOption {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean | null;
}

/**
 * The picker behind "Assign to menus" and "Assign to categories": which
 * records a schedule controls. Callers own the data and the save; this owns
 * the shape.
 *
 * - A centred dialog, full screen on phones: it holds a list the user works
 *   through, so it is not a confirm card (§12, §13.1). The content clips and
 *   only the list scrolls, so no rules separate header and footer (§5.5).
 * - Selection is the checkbox alone, filled `bg-foreground` like the device
 *   catalog's, never `--primary`. Rows stay neutral (§3.5).
 * - Active/Inactive is a state, said in plain words on the muted row (§3.5,
 *   "values are plain text, not pills").
 */
export function ScheduleAssignDialog({
  open,
  onOpenChange,
  title,
  description,
  options,
  selectedIds,
  onToggle,
  isLoading,
  emptyTitle,
  emptyHint,
  added,
  removed,
  isSaving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  options: ScheduleAssignOption[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  isLoading: boolean;
  /** e.g. "No menus yet". */
  emptyTitle: string;
  /** What makes options appear, e.g. "Create a menu first, then assign it here." */
  emptyHint: string;
  /** Pending changes, for the footer summary and the Save state. */
  added: number;
  removed: number;
  isSaving: boolean;
  onSave: () => void;
}) {
  const hasChanges = added > 0 || removed > 0;
  const summary = hasChanges
    ? [added > 0 && `${added} to add`, removed > 0 && `${removed} to remove`]
        .filter(Boolean)
        .join(" · ")
    : `${selectedIds.size} assigned`;

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="flex h-dvh max-h-dvh min-h-0 w-full max-w-none flex-col overflow-hidden sm:h-auto sm:max-h-[85vh] sm:max-w-xl">
        <DialogHeader className="shrink-0 pr-10 text-left">
          <DialogTitle className="text-left">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          ) : options.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 text-center">
              <p className="text-sm font-medium">{emptyTitle}</p>
              <p className="text-xs text-muted-foreground">{emptyHint}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {options.map((option) => {
                const checked = selectedIds.has(option.id);
                const inputId = `schedule-assign-${option.id}`;
                return (
                  <li key={option.id}>
                    <label
                      htmlFor={inputId}
                      className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-muted/45 px-4 py-3 transition-colors hover:bg-muted"
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={() => onToggle(option.id)}
                        className="data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background dark:data-[state=checked]:bg-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{option.name}</span>
                        {option.description && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </span>
                      {option.is_active != null && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {option.is_active ? "Active" : "Inactive"}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground tabular-nums">
            {isLoading ? null : summary}
          </p>
          <Button
            variant="outline"
            className="max-sm:h-11"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button className="max-sm:h-11" onClick={onSave} disabled={!hasChanges || isSaving}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
