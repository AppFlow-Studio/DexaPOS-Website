"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, MonitorSmartphone } from "lucide-react";
import Link from "next/link";

export default function DeviceDetailPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/dashboard/settings/devices"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Devices
        </Link>
      </div>

      <Card>
        <CardContent className="py-12 flex flex-col items-center justify-center text-center">
          <MonitorSmartphone className="h-12 w-12 mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">
            Device Detail View — Coming Soon
          </h3>
          <p className="text-muted-foreground max-w-md mb-4">
            The detailed device view is being rebuilt to show real-time hardware
            diagnostics. Use the Edit action on the devices list to modify
            device settings.
          </p>
          <Button asChild>
            <Link href="/dashboard/settings/devices">View All Devices</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
