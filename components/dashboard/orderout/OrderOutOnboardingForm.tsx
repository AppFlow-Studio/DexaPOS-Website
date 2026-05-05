"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PhoneInput } from "@/components/ui/phone-input";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

// ============================================================================
// Schema
// ============================================================================

const onboardingSchema = z.object({
  accountName: z.string().min(2, "Business name must be at least 2 characters"),
  restaurantName: z.string().min(2, "Restaurant name must be at least 2 characters"),
  streetAddress: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zipcode: z.string().min(1, "Zip code is required"),
  country: z.string().min(1, "Country is required"),
  restaurantManagerEmail: z.string().email("Valid email required"),
  restaurantManagerFirstname: z.string().min(1, "First name is required"),
  restaurantManagerLastname: z.string().min(1, "Last name is required"),
  restaurantManagerPhone: z.string().min(1, "Phone number is required").refine(v => isValidPhone(v), { message: 'Enter a valid phone number' }),
});

export type OnboardingFormData = z.infer<typeof onboardingSchema>;

// ============================================================================
// Props
// ============================================================================

interface OrderOutOnboardingFormProps {
  defaultValues?: Partial<OnboardingFormData>;
  isSubmitting: boolean;
  onSubmit: (data: OnboardingFormData) => void;
  onCancel: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function OrderOutOnboardingForm({
  defaultValues,
  isSubmitting,
  onSubmit,
  onCancel,
}: OrderOutOnboardingFormProps) {
  const [pendingData, setPendingData] = useState<OnboardingFormData | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      accountName: "",
      restaurantName: "",
      streetAddress: "",
      city: "",
      state: "",
      zipcode: "",
      country: "US",
      restaurantManagerEmail: "",
      restaurantManagerFirstname: "",
      restaurantManagerLastname: "",
      restaurantManagerPhone: "",
      ...defaultValues,
    },
  });

  const handleFormSubmit = (data: OnboardingFormData) => {
    setPendingData(data);
  };

  const handleConfirm = () => {
    if (pendingData) {
      onSubmit({
        ...pendingData,
        restaurantManagerPhone: normalizePhone(pendingData.restaurantManagerPhone) ?? pendingData.restaurantManagerPhone,
      });
      setPendingData(null);
    }
  };

  return (
    <>
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Restaurant Info */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Restaurant Details
        </h4>
        <div className="space-y-2">
          <Label htmlFor="accountName">Business Name *</Label>
          <Input
            id="accountName"
            {...register("accountName")}
            placeholder="My Restaurant"
          />
          {errors.accountName && (
            <p className="text-sm text-destructive">
              {errors.accountName.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurantName">Restaurant / Location Name *</Label>
          <Input
            id="restaurantName"
            {...register("restaurantName")}
            placeholder="Downtown Location"
          />
          {errors.restaurantName && (
            <p className="text-sm text-destructive">
              {errors.restaurantName.message}
            </p>
          )}
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Address
        </h4>
        <div className="space-y-2">
          <Label htmlFor="streetAddress">Street Address *</Label>
          <Input
            id="streetAddress"
            {...register("streetAddress")}
            placeholder="123 Main St"
          />
          {errors.streetAddress && (
            <p className="text-sm text-destructive">
              {errors.streetAddress.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              {...register("city")}
              placeholder="New York"
            />
            {errors.city && (
              <p className="text-sm text-destructive">{errors.city.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State *</Label>
            <Input
              id="state"
              {...register("state")}
              placeholder="NY"
            />
            {errors.state && (
              <p className="text-sm text-destructive">{errors.state.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="zipcode">Zip Code *</Label>
            <Input
              id="zipcode"
              {...register("zipcode")}
              placeholder="10001"
            />
            {errors.zipcode && (
              <p className="text-sm text-destructive">
                {errors.zipcode.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country *</Label>
            <Input
              id="country"
              {...register("country")}
              placeholder="US"
            />
            {errors.country && (
              <p className="text-sm text-destructive">
                {errors.country.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Restaurant Manager */}
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
          Restaurant Manager
        </h4>
        <p className="text-sm text-muted-foreground">
          OrderOut will email this person to set up their restaurant dashboard account.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="restaurantManagerFirstname">First Name *</Label>
            <Input
              id="restaurantManagerFirstname"
              {...register("restaurantManagerFirstname")}
              placeholder="John"
            />
            {errors.restaurantManagerFirstname && (
              <p className="text-sm text-destructive">
                {errors.restaurantManagerFirstname.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="restaurantManagerLastname">Last Name *</Label>
            <Input
              id="restaurantManagerLastname"
              {...register("restaurantManagerLastname")}
              placeholder="Doe"
            />
            {errors.restaurantManagerLastname && (
              <p className="text-sm text-destructive">
                {errors.restaurantManagerLastname.message}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurantManagerEmail">Email *</Label>
          <Input
            id="restaurantManagerEmail"
            type="email"
            {...register("restaurantManagerEmail")}
            placeholder="manager@restaurant.com"
          />
          {errors.restaurantManagerEmail && (
            <p className="text-sm text-destructive">
              {errors.restaurantManagerEmail.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="restaurantManagerPhone">Phone *</Label>
          <Controller
            control={control}
            name="restaurantManagerPhone"
            render={({ field }) => (
              <PhoneInput
                id="restaurantManagerPhone"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                aria-invalid={!!errors.restaurantManagerPhone}
              />
            )}
          />
          {errors.restaurantManagerPhone && (
            <p className="text-sm text-destructive">
              {errors.restaurantManagerPhone.message}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Connect to OrderOut
        </Button>
      </div>
    </form>

    {/* Confirmation Dialog */}
    <AlertDialog open={!!pendingData} onOpenChange={(open) => { if (!open) setPendingData(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Restaurant Manager</AlertDialogTitle>
          <AlertDialogDescription>
            OrderOut will send an onboarding email to{" "}
            <span className="font-medium text-foreground">
              {pendingData?.restaurantManagerFirstname} {pendingData?.restaurantManagerLastname}
            </span>{" "}
            at{" "}
            <span className="font-medium text-foreground">
              {pendingData?.restaurantManagerEmail}
            </span>
            . They will use this to create their OrderOut dashboard account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Confirm &amp; Connect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
