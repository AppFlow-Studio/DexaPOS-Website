"use client";

import { useForm, Controller } from "react-hook-form";
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
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { useLocationStore, useSelectedLocation, useIsSingleLocation } from "@/stores/location-store";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  contact_name: z.string().optional(),
  phone: z.string().optional().refine(v => !v || isValidPhone(v), { message: 'Enter a valid phone number' }),
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
  const isSingleLocation = useIsSingleLocation();

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
      phone: (normalizePhone(values.phone) ?? values.phone) || undefined,
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
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
              <Truck className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <DialogTitle>Add Vendor</DialogTitle>
              <DialogDescription>
                Add a new supplier to your vendor list
              </DialogDescription>
            </div>
            {/* Scope badge - show where this vendor will be created.
                Hidden for single-location accounts (always global). */}
            {isSingleLocation ? null : isGlobalView ? (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 rounded-full border-0 bg-muted/60 text-muted-foreground"
              >
                <Globe className="h-3 w-3" />
                Global
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="min-w-0 shrink-0 gap-1 rounded-full border-0 bg-muted/60 text-muted-foreground"
              >
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {selectedLocation?.name || "Location"}
                </span>
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
          {/* Info banner explaining scope — hidden for single-location accounts. */}
          {!isSingleLocation && (
            <div className="rounded-2xl border-0 bg-muted/60 p-3 text-sm text-muted-foreground">
              {isGlobalView ? (
                <>
                  <Globe className="mr-2 inline h-4 w-4" />
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
          )}

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

          {/* Contact Person and Phone each take a full row — the phone control
              (country selector + number) is too wide to share one. */}
          <div className="space-y-4">
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
              <Controller
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <PhoneInput
                    id="phone"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-invalid={!!form.formState.errors.phone}
                  />
                )}
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
