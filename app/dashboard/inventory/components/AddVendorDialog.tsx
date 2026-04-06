"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import { Badge } from "@/components/ui/badge";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Truck, Loader2, Globe, MapPin } from "lucide-react";
import { useCreateVendor } from "../hooks/useInventoryManagement";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  contact_name: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val === "") return true; // Optional - allow empty
        // Strip all non-digit characters and check for 10 digits
        const digitsOnly = val.replace(/\D/g, "");
        return digitsOnly.length === 10;
      },
      { message: "Phone must be 10 digits" }
    ),
  email: z.string().email().optional().or(z.literal("")),
  address_line1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AddVendorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddVendorDialog({ open, onOpenChange }: AddVendorDialogProps) {
  const createVendor = useCreateVendor();
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();

  // Determine if we're in global or location view
  const isGlobalView = selectedLocationId === "all" || !selectedLocationId;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      contact_name: "",
      phone: "",
      email: "",
      address_line1: "",
      city: "",
      state: "",
      zip_code: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    await createVendor.mutateAsync({
      name: values.name,
      contact_name: values.contact_name || undefined,
      phone: values.phone || undefined,
      email: values.email || undefined,
      address_line1: values.address_line1 || undefined,
      city: values.city || undefined,
      state: values.state || undefined,
      zip_code: values.zip_code || undefined,
      // Set location_id based on view:
      // - Global view (All Locations) → null (global vendor)
      // - Location view → selectedLocationId (location-specific vendor)
      location_id: isGlobalView ? null : selectedLocationId,
    });

    if (!createVendor.isError) {
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/10">
              <Truck className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <DialogTitle>Add Vendor</DialogTitle>
              <DialogDescription>
                Add a new supplier to your vendor list
              </DialogDescription>
            </div>
            {/* Scope badge - show where this vendor will be created */}
            {isGlobalView ? (
              <Badge
                variant="outline"
                className="gap-1 text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30"
              >
                <Globe className="h-3 w-3" />
                Global
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <MapPin className="h-3 w-3" />
                {selectedLocation?.name || "Location"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          {/* Info banner explaining scope */}
          <div className="p-3 rounded-lg bg-muted/50 border text-sm text-muted-foreground">
            {isGlobalView ? (
              <>
                <Globe className="h-4 w-4 inline mr-2 text-emerald-600" />
                This vendor will be available to <strong>all locations</strong>.
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 inline mr-2" />
                This vendor will only be available at{" "}
                <strong>{selectedLocation?.name}</strong>.
              </>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Vendor Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Sysco Foods"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Contact Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_name">Contact Person</Label>
              <Input
                id="contact_name"
                placeholder="John Smith"
                {...form.register("contact_name")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                {...form.register("phone")}
              />
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="orders@vendor.com"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address_line1">Address</Label>
            <AddressAutocomplete
              id="address_line1"
              value={form.watch("address_line1") ?? ""}
              onInputChange={(v) =>
                form.setValue("address_line1", v, { shouldDirty: true })
              }
              onAddressSelected={(parts) => {
                form.setValue("address_line1", parts.address_line1, {
                  shouldDirty: true,
                });
                form.setValue("city", parts.city, { shouldDirty: true });
                form.setValue("state", parts.state, { shouldDirty: true });
                form.setValue(
                  "zip_code",
                  parts.postal_code.split("-")[0],
                  { shouldDirty: true }
                );
              }}
              placeholder="123 Main Street"
            />
          </div>

          {/* City, State, Zip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="New York"
                {...form.register("city")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" placeholder="NY" {...form.register("state")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip_code">Zip Code</Label>
              <Input
                id="zip_code"
                placeholder="10001"
                {...form.register("zip_code")}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createVendor.isPending}
              className="gap-2"
            >
              {createVendor.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Add Vendor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
