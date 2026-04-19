"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { MapPin, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import {
  useTodayTipSummary,
  useTodayShifts,
  useCalculateTipDistribution,
} from "./hooks/useTipDistribution";
import { TodayHeader } from "./components/TodayHeader";
import { ActiveShiftsPanel } from "./components/ActiveShiftsPanel";
import { ConfigSummaryPanel } from "./components/ConfigSummaryPanel";
import { CloseOutDialog } from "./components/CloseOutDialog";

export default function TipsPage() {
  const router = useRouter();
  const clerkOrgId = useClerkOrgId();
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();

  const todayDate = format(new Date(), "yyyy-MM-dd");

  const [closeOutOpen, setCloseOutOpen] = useState(false);

  // Today tab data (30s polling)
  const { data: summary, isLoading: summaryLoading } = useTodayTipSummary(
    clerkOrgId,
    selectedLocationId !== "all" ? selectedLocationId : undefined,
    todayDate
  );
  const { data: shifts = [], isLoading: shiftsLoading } = useTodayShifts(
    clerkOrgId,
    selectedLocationId !== "all" ? selectedLocationId : undefined,
    todayDate
  );

  const calculateMutation = useCalculateTipDistribution();

  // Derived data
  const staffStillClockedIn = useMemo(
    () => shifts.filter((s) => !s.clockOutTime).length,
    [shifts]
  );

  const undeclaredStaff = useMemo(
    () => shifts.filter((s) => s.clockOutTime && !s.tipsDeclaredAt),
    [shifts]
  );

  // Close out handler
  const handleCloseOut = () => {
    calculateMutation.mutate(
      {
        clerkOrgId: clerkOrgId!,
        locationId: selectedLocationId!,
        sessionDate: todayDate,
        shiftPeriod: "full_day",
        staffProfileId: null,
      },
      {
        onSuccess: (data) => {
          setCloseOutOpen(false);
          if (data?.session_id) {
            router.push(`/dashboard/tips/${data.session_id}`);
          }
        },
      }
    );
  };

  // Location guard
  if (selectedLocationId === "all") {
    return (
      <div className="space-y-6">
        <div>
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
            <span>Reports</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium">Tip Distribution</span>
          </nav>
          <h1 className="text-2xl font-bold">Tip Distribution</h1>
        </div>

        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Select a Location</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Tip distribution is location-specific. Please select a specific location from the
                top navigation to manage tips for that location.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const locationName = selectedLocation?.name || "Location";

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div>
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
          <span>Reports</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Tip Distribution</span>
        </nav>
        <h1 className="text-2xl font-bold">Tip Distribution</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Today&apos;s live tip overview for {locationName}
        </p>
      </div>

      {/* TODAY HEADER — stats + close out CTA */}
      <TodayHeader
        date={todayDate}
        locationName={locationName}
        summary={summary ?? null}
        isLoading={summaryLoading}
        staffStillClockedIn={staffStillClockedIn}
        undeclaredStaffCount={undeclaredStaff.length}
        onCloseOut={() => setCloseOutOpen(true)}
        isClosingOut={calculateMutation.isPending}
      />

      {/* ACTIVE SHIFTS */}
      <ActiveShiftsPanel shifts={shifts} isLoading={shiftsLoading} />

      {/* PROJECTED DISTRIBUTION — placeholder until preview RPC */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Projected Distribution
        </h3>
        <Card className="p-6 text-center border-dashed">
          <p className="text-sm text-muted-foreground">
            Live projection will be available after the preview calculation RPC is implemented.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Use &quot;Close Out & Calculate&quot; to see the final distribution.
          </p>
        </Card>
      </section>

      {/* CONFIG SUMMARY */}
      <ConfigSummaryPanel
        clerkOrgId={clerkOrgId}
        locationId={selectedLocationId !== "all" ? selectedLocationId : undefined}
      />

      {/* CLOSE OUT DIALOG */}
      <CloseOutDialog
        open={closeOutOpen}
        onOpenChange={setCloseOutOpen}
        undeclaredStaff={undeclaredStaff}
        onConfirm={handleCloseOut}
        isLoading={calculateMutation.isPending}
      />
    </div>
  );
}
