"use client";

import { Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Shown at the top of website-builder screens when the current user is not the
 * merchant owner. Website editing is owner-only (product decision 2026-09-13):
 * managers and admins may view, but every mutating control is hidden/disabled.
 */
export function OwnerOnlyBanner({ className }: { className?: string }) {
  return (
    <Alert className={className}>
      <Lock />
      <AlertTitle>View only</AlertTitle>
      <AlertDescription>
        Only the store owner can change the website. You can browse it here, but
        editing, publishing, and settings are locked.
      </AlertDescription>
    </Alert>
  );
}
