"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { ColorSwatchPicker } from "@/app/dashboard/settings/stations/components/ColorSwatchPicker";
import {
  useCreatePrepStation,
  useUpdatePrepStation,
  type PrepStation,
} from "@/app/dashboard/hooks/usePrepStations";

interface AddEditPrepStationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
  clerkOrgId: string;
  stationToEdit?: PrepStation | null;
}

export function AddEditPrepStationDialog({
  open,
  onOpenChange,
  locationId,
  clerkOrgId,
  stationToEdit,
}: AddEditPrepStationDialogProps) {
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState("#3B82F6");

  const createMutation = useCreatePrepStation();
  const updateMutation = useUpdatePrepStation();

  const isEditing = !!stationToEdit;
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Populate form when editing
  React.useEffect(() => {
    if (stationToEdit) {
      setName(stationToEdit.name);
      setColor(stationToEdit.color);
    } else {
      setName("");
      setColor("#3B82F6");
    }
  }, [stationToEdit]);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setName("");
      setColor("#3B82F6");
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) return;

    if (isEditing && stationToEdit) {
      await updateMutation.mutateAsync({
        stationId: stationToEdit.id,
        input: { name: trimmedName, color },
      });
    } else {
      await createMutation.mutateAsync({
        clerkOrgId,
        input: { locationId, name: trimmedName, color },
      });
    }

    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isPending && onOpenChange(o)}>
      {/* §13.1 — a panel the user fills in goes full-screen below `sm`.
          `h-dvh`, not `h-screen`: 100vh sits behind the mobile address bar. */}
      <DialogContent className="flex h-dvh max-h-dvh w-screen max-w-none flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-[425px] sm:rounded-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isEditing ? "Edit Prep Station" : "Add Prep Station"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the prep station name or color."
              : "Create a new prep station for this location. Items assigned to it will route to the matching KDS display."}
          </DialogDescription>
        </DialogHeader>

        {/* The dialog clips; this body is the only scroller, so the bar tracks
            the panel edge rather than cutting across the rounded corner. */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="station-name">Name</Label>
            <Input
              id="station-name"
              placeholder="e.g., Grill, Fryer, Bar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label>Display Color</Label>
            <ColorSwatchPicker value={color} onChange={setColor} />
          </div>
          </div>

          <DialogFooter className="shrink-0 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Station"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
