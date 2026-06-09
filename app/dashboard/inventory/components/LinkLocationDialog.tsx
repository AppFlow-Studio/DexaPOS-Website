"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Loader2, AlertCircle, Star } from "lucide-react";
import { toast } from "sonner";
import {
  GetAvailableLocationsForVendor,
  LinkVendorToLocation,
} from "@/app/dashboard/actions/location-vendors";

interface LinkLocationDialogProps {
  vendorId: string;
  vendorName: string;
  clerkOrgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function LinkLocationDialog({
  vendorId,
  vendorName,
  clerkOrgId,
  open,
  onOpenChange,
  onSuccess,
}: LinkLocationDialogProps) {
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [isPreferred, setIsPreferred] = useState(false);

  // Fetch available locations
  const { data: availableData, isLoading: isLoadingLocations } = useQuery({
    queryKey: ["available-locations-for-vendor", vendorId, clerkOrgId],
    queryFn: () => GetAvailableLocationsForVendor(clerkOrgId, vendorId),
    enabled: !!vendorId && !!clerkOrgId && open,
  });

  const availableLocations = availableData?.data || [];

  // Mutation
  const linkMutation = useMutation({
    mutationFn: () =>
      LinkVendorToLocation({
        vendorId,
        locationId: selectedLocationId,
        accountNumber: accountNumber || undefined,
        notes: notes || undefined,
        isPreferred,
      }),
    onSuccess: (result) => {
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Location linked successfully");
        onSuccess();
        onOpenChange(false);
        resetForm();
      }
    },
    onError: () => toast.error("Failed to link location"),
  });

  const resetForm = () => {
    setSelectedLocationId("");
    setAccountNumber("");
    setNotes("");
    setIsPreferred(false);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const handleSubmit = () => {
    if (!selectedLocationId) {
      toast.error("Please select a location");
      return;
    }
    linkMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" elevation="above-sheet">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Link Location
          </DialogTitle>
          <DialogDescription>
            Enable {vendorName} to supply a specific location
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoadingLocations ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableLocations.length === 0 ? (
            <div className="text-center py-6">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                All available locations are already linked to this vendor.
              </p>
            </div>
          ) : (
            <>
              {/* Select Location */}
              <div className="space-y-2">
                <Label>Select Location *</Label>
                <Select
                  value={selectedLocationId}
                  onValueChange={setSelectedLocationId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a location..." />
                  </SelectTrigger>
                  <SelectContent className="z-[220]">
                    {availableLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Account Number */}
              <div className="space-y-2">
                <Label>Account Number (for this location)</Label>
                <Input
                  placeholder="e.g. LOC-001"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  placeholder="Delivery instructions, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Preferred */}
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="locPreferred"
                  checked={isPreferred}
                  onCheckedChange={(c) => setIsPreferred(!!c)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="locPreferred"
                    className="text-sm font-medium leading-none flex items-center gap-1"
                  >
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    Preferred Vendor
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Set as preferred supplier for this location
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              linkMutation.isPending ||
              !selectedLocationId ||
              availableLocations.length === 0
            }
          >
            {linkMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Link Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
