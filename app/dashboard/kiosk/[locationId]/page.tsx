import { notFound } from "next/navigation";

import { listKioskProfiles } from "@/app/dashboard/actions/kiosk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KioskEditor } from "./KioskEditor";

export default async function KioskLocationPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  const result = await listKioskProfiles(locationId);

  if (!result.success) {
    if (result.error === "Location not found") notFound();
    return (
      <Alert variant="destructive">
        <AlertTitle>Kiosk editor unavailable</AlertTitle>
        <AlertDescription>{result.error}</AlertDescription>
      </Alert>
    );
  }

  return <KioskEditor initialData={result.data} />;
}
