"use client";

import { useEffect } from "react";
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
import {
  useUpdateVendor,
  VendorWithStats,
} from "../hooks/useInventoryManagement";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone, normalizePhone } from "@/lib/phone";

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

interface EditVendorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: VendorWithStats | null;
}

export function EditVendorDialog({
  open,
  onOpenChange,
  vendor,
}: EditVendorDialogProps) {
  const updateVendor = useUpdateVendor();

  const isGlobal = !vendor?.location_id;

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

  // Reset form when vendor changes
  useEffect(() => {
    if (vendor) {
      form.reset({
        name: vendor.name,
        contact_name: vendor.contact_name || "",
        phone: vendor.phone || "",
        email: vendor.email || "",
        address_line1: vendor.address_line1 || "",
        city: vendor.city || "",
        state: vendor.state || "",
        zip_code: vendor.zip_code || "",
      });
    }
  }, [vendor, form]);

  const onSubmit = async (values: FormValues) => {
    if (!vendor) return;

    await updateVendor.mutateAsync({
      vendorId: vendor.id,
      data: {
        name: values.name,
        contact_name: values.contact_name || undefined,
        phone: (normalizePhone(values.phone) ?? values.phone) || undefined,
        email: values.email || undefined,
        address_line1: values.address_line1 || undefined,
        city: values.city || undefined,
        state: values.state || undefined,
        zip_code: values.zip_code || undefined,
      },
    });

    if (!updateVendor.isError) {
      onOpenChange(false);
    }
  };

  if (!vendor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" elevation="above-sheet">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/10">
              <Truck className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <DialogTitle>Edit Vendor</DialogTitle>
              <DialogDescription>Update vendor details</DialogDescription>
            </div>
            {isGlobal ? (
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
                Local
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
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
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-4">
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
              disabled={updateVendor.isPending}
              className="gap-2"
            >
              {updateVendor.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
