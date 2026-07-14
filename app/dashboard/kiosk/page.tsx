import Link from "next/link";
import { ArrowRight, MonitorPlay, Plus } from "lucide-react";

import { listKioskLocations } from "@/app/dashboard/actions/kiosk";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function KioskLocationsPage() {
  const result = await listKioskLocations();

  if (!result.success) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Kiosk settings unavailable</AlertTitle>
        <AlertDescription>{result.error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-10">
      <div className="rounded-md border bg-background p-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kiosk</h1>
          <p className="text-sm text-muted-foreground">
            Configure templates, branding, behavior, payment pairing, and station bindings per location.
          </p>
        </div>
      </div>

      {result.data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center">
            <MonitorPlay className="mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No locations available</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Create a location before configuring a kiosk profile.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.data.map((location) => (
            <Card key={location.id} className="overflow-hidden shadow-sm transition hover:border-primary/40 hover:shadow">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{location.name}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {location.address || "Location kiosk configuration"}
                    </CardDescription>
                  </div>
                  <Badge variant={location.activeProfileCount > 0 ? "default" : "secondary"}>
                    {location.activeProfileCount > 0 ? "Live" : "Draft"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3 border-t bg-muted/20 py-3">
                <div className="text-sm text-muted-foreground">
                  {location.totalProfileCount === 0
                    ? "No profiles yet"
                    : `${location.totalProfileCount} profile${location.totalProfileCount === 1 ? "" : "s"}`}
                </div>
                <Button asChild size="sm">
                  <Link href={`/dashboard/kiosk/${location.id}`}>
                    {location.totalProfileCount === 0 ? (
                      <Plus className="mr-2 h-4 w-4" />
                    ) : (
                      <ArrowRight className="mr-2 h-4 w-4" />
                    )}
                    Open
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
