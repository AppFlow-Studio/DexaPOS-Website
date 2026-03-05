"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useCustomerReservations, useCustomerWaitlist, useCustomerDineSessions } from "../../hooks/useCustomerBookings";
import { useLocationStore } from "@/stores/location-store";
import type { CustomerListItem } from "@/types/customer";

interface BookingsTabProps {
  customer: CustomerListItem | null;
}

export function BookingsTab({ customer }: BookingsTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<"reservations" | "waitlist" | "dine">("reservations");
  const { selectedLocationId } = useLocationStore();
  const customerId = customer?.id || null;

  const { data: reservations = [], isLoading: loadingRes } = useCustomerReservations(customerId, selectedLocationId);
  const { data: waitlist = [], isLoading: loadingWait } = useCustomerWaitlist(customerId, selectedLocationId);
  const { data: dineSessions = [], isLoading: loadingDine } = useCustomerDineSessions(customerId, selectedLocationId);

  const stats = useMemo(() => {
    const totalBookings = reservations.length;
    const completedBookings = reservations.filter((r: any) => r.status === "completed").length;
    const noShows = reservations.filter((r: any) => r.status === "no_show").length;
    const avgPartySize =
      totalBookings > 0
        ? (reservations.reduce((sum, r: any) => sum + (r.party_size || 0), 0) / totalBookings).toFixed(1)
        : 0;
    const noShowRate = totalBookings > 0 ? ((noShows / totalBookings) * 100).toFixed(1) : 0;

    return {
      totalBookings,
      completedBookings,
      completedPct: totalBookings > 0 ? ((completedBookings / totalBookings) * 100).toFixed(1) : 0,
      noShows,
      noShowRate,
      avgPartySize,
    };
  }, [reservations]);

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Bookings</p>
            <p className="text-2xl font-bold mt-2">{stats.totalBookings}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Completed</p>
            <p className="text-2xl font-bold mt-2">{stats.completedBookings}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.completedPct}%</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">No-Shows</p>
            <p className="text-2xl font-bold mt-2">{stats.noShows}</p>
            <p className="text-xs text-muted-foreground mt-1">{stats.noShowRate}%</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-card">
          <CardContent className="pt-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Avg Party Size</p>
            <p className="text-2xl font-bold mt-2">{stats.avgPartySize}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sub-tabs */}
      <Tabs value={activeSubTab} onValueChange={(val) => setActiveSubTab(val as any)}>
        <TabsList className="bg-muted">
          <TabsTrigger value="reservations">Reservations ({reservations.length})</TabsTrigger>
          <TabsTrigger value="waitlist">Waitlist ({waitlist.length})</TabsTrigger>
          <TabsTrigger value="dine">Dine-In ({dineSessions.length})</TabsTrigger>
        </TabsList>

        {/* Reservations */}
        <TabsContent value="reservations" className="mt-6">
          {loadingRes ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : reservations.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No reservations</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto bg-white dark:bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date & Time</th>
                    <th className="px-4 py-3 text-left font-medium">Party Size</th>
                    <th className="px-4 py-3 text-left font-medium">Location</th>
                    <th className="px-4 py-3 text-left font-medium">Table</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {(reservations as any[]).map((res) => (
                    <tr key={res.id} className="border-t hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm">
                        {res.reservation_date} {res.reservation_time}
                      </td>
                      <td className="px-4 py-3 text-sm">{res.party_size}</td>
                      <td className="px-4 py-3 text-sm">{res.location?.name}</td>
                      <td className="px-4 py-3 text-sm">{res.assigned_table_ids?.join(", ") || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{res.status || "—"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                        {res.special_requests || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Waitlist */}
        <TabsContent value="waitlist" className="mt-6">
          {loadingWait ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : waitlist.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No waitlist entries</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto bg-white dark:bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Party</th>
                    <th className="px-4 py-3 text-left font-medium">Quoted Wait</th>
                    <th className="px-4 py-3 text-left font-medium">Actual Wait</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {(waitlist as any[]).map((entry) => (
                    <tr key={entry.id} className="border-t hover:bg-muted/50">
                      <td className="px-4 py-3 text-sm">{new Date(entry.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-sm">{entry.party_size}</td>
                      <td className="px-4 py-3 text-sm">{entry.quoted_wait_minutes} min</td>
                      <td className="px-4 py-3 text-sm">
                        {entry.actual_wait_minutes ? `${entry.actual_wait_minutes} min` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{entry.status || "—"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">{entry.location?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Dine-In Sessions */}
        <TabsContent value="dine" className="mt-6">
          {loadingDine ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : dineSessions.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">No dine-in sessions</div>
          ) : (
            <div className="border rounded-lg overflow-x-auto bg-white dark:bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Table(s)</th>
                    <th className="px-4 py-3 text-left font-medium">Party</th>
                    <th className="px-4 py-3 text-left font-medium">Duration</th>
                    <th className="px-4 py-3 text-left font-medium">Server</th>
                    <th className="px-4 py-3 text-left font-medium">Order</th>
                    <th className="px-4 py-3 text-left font-medium">Complaint</th>
                  </tr>
                </thead>
                <tbody>
                  {(dineSessions as any[]).map((session) => {
                    const duration = session.closed_at
                      ? Math.round((new Date(session.closed_at).getTime() - new Date(session.seated_at).getTime()) / 60000)
                      : null;
                    return (
                      <tr key={session.id} className="border-t hover:bg-muted/50">
                        <td className="px-4 py-3 text-sm">{new Date(session.seated_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-sm">{session.table_numbers?.join(", ") || "—"}</td>
                        <td className="px-4 py-3 text-sm">{session.party_size}</td>
                        <td className="px-4 py-3 text-sm">{duration ? `${duration} min` : "—"}</td>
                        <td className="px-4 py-3 text-sm">{session.server?.display_name || "—"}</td>
                        <td className="px-4 py-3 text-sm">{session.order?.display_number || "—"}</td>
                        <td className="px-4 py-3">
                          {session.is_complaint ? <Badge variant="destructive">Yes</Badge> : "No"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
