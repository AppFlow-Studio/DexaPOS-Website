"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MonitorSmartphone,
  Search,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import {
  useLocationStore,
  useIsAllLocations,
  useSelectedLocation,
} from "@/stores/location-store";
import { DeviceCard } from "./components/DeviceCard";
import { DevicesTable } from "./components/DevicesTable";
import { EditDeviceDialog } from "./components/EditDeviceDialog";
import {
  useDevicesHardware,
  StationWithHeartbeat,
} from "./hooks/useDevices";
import { useDeviceRealtime } from "./hooks/useDeviceRealtime";

type SortColumn = "name" | "status" | "lastSeen";
type SortDirection = "asc" | "desc";

const ITEMS_PER_PAGE = 10;

export default function DevicesPage() {
  const selectedLocationId = useLocationStore(
    (state) => state.selectedLocationId
  );
  const isAllLocations = useIsAllLocations();
  const selectedLocation = useSelectedLocation();

  // Fetch devices
  const {
    data: devices = [],
    isLoading,
    isError,
    error,
  } = useDevicesHardware(selectedLocationId);

  // Realtime subscription
  useDeviceRealtime(selectedLocationId);

  // Filter & search state
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // Edit dialog state
  const [editingDevice, setEditingDevice] = useState<StationWithHeartbeat | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter]);

  // Filtered and sorted devices
  const filteredDevices = useMemo(() => {
    let result = [...devices];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (d) =>
          d.station_name.toLowerCase().includes(term) ||
          d.station_code?.toLowerCase().includes(term) ||
          d.device_model?.toLowerCase().includes(term) ||
          d.hardware_model?.toLowerCase().includes(term)
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((d) => d.station_type === typeFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      const isOnlineFilter = statusFilter === "online";
      result = result.filter((d) => {
        const online = d.latest_heartbeat?.is_online ?? d.is_online;
        return online === isOnlineFilter;
      });
    }

    // Sorting
    if (sortColumn) {
      result.sort((a, b) => {
        let comparison = 0;
        switch (sortColumn) {
          case "name":
            comparison = a.station_name.localeCompare(b.station_name);
            break;
          case "status": {
            const aOnline = a.latest_heartbeat?.is_online ?? a.is_online;
            const bOnline = b.latest_heartbeat?.is_online ?? b.is_online;
            comparison = Number(aOnline) - Number(bOnline);
            break;
          }
          case "lastSeen": {
            const aTime = a.latest_heartbeat?.heartbeat_at || a.last_heartbeat_at || "";
            const bTime = b.latest_heartbeat?.heartbeat_at || b.last_heartbeat_at || "";
            comparison = aTime.localeCompare(bTime);
            break;
          }
        }
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [devices, searchTerm, typeFilter, statusFilter, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredDevices.length / ITEMS_PER_PAGE);
  const showPagination = filteredDevices.length > ITEMS_PER_PAGE;
  const paginatedDevices = useMemo(() => {
    if (!showPagination) return filteredDevices;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDevices.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDevices, currentPage, showPagination]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column as SortColumn);
      setSortDirection("asc");
    }
  };

  const handleEdit = (device: StationWithHeartbeat) => {
    setEditingDevice(device);
    setIsEditDialogOpen(true);
  };

  // "All Locations" prompt
  if (isAllLocations) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Device Management
          </h2>
          <p className="text-muted-foreground">
            Monitor and configure your POS devices
          </p>
        </div>

        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <MapPin className="h-12 w-12 mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Select a Location</h3>
            <p className="text-muted-foreground max-w-md">
              Devices are location-specific. Please select a location from the
              dropdown above to view and manage devices for that location.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Device Management
          </h2>
          <p className="text-muted-foreground">
            Devices for{" "}
            <span className="font-medium">{selectedLocation?.name}</span>
          </p>
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-10 w-[300px]" />
          <Skeleton className="h-10 w-[180px]" />
          <Skeleton className="h-10 w-[140px]" />
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Device Management
          </h2>
          <p className="text-muted-foreground">
            Devices for{" "}
            <span className="font-medium">{selectedLocation?.name}</span>
          </p>
        </div>
        <Card>
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="h-12 w-12 mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">
              Failed to load devices
            </h3>
            <p className="text-muted-foreground max-w-md">
              {error instanceof Error
                ? error.message
                : "An error occurred while loading devices."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          Device Management
        </h2>
        <p className="text-muted-foreground">
          Monitor and configure devices for{" "}
          <span className="font-medium">{selectedLocation?.name}</span>
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or model..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Type Filter */}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Station type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="register">Register</SelectItem>
            <SelectItem value="kds">Kitchen Display</SelectItem>
            <SelectItem value="checkout">Checkout</SelectItem>
            <SelectItem value="self_service">Self-Service</SelectItem>
          </SelectContent>
        </Select>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {filteredDevices.length === 0 ? (
        devices.length === 0 ? (
          <Empty
            icon={MonitorSmartphone}
            title="No devices found"
            description="No active stations at this location. Create stations in the Stations page first, then devices will appear here once the POS app connects."
          />
        ) : (
          <Empty
            icon={Search}
            title="No devices found"
            description="Try adjusting your search or filter criteria."
          />
        )
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block">
            <DevicesTable
              devices={paginatedDevices}
              onEdit={handleEdit}
              sortColumn={sortColumn}
              sortDirection={sortDirection ?? "asc"}
              onSort={handleSort}
            />
          </div>

          {/* Mobile/Tablet Card View */}
          <div className="lg:hidden grid gap-4 sm:grid-cols-2">
            {paginatedDevices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onEdit={handleEdit}
              />
            ))}
          </div>

          {/* Pagination */}
          {showPagination && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(
                  currentPage * ITEMS_PER_PAGE,
                  filteredDevices.length
                )}{" "}
                of {filteredDevices.length} devices
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit Dialog */}
      <EditDeviceDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) setEditingDevice(null);
        }}
        device={editingDevice}
      />
    </div>
  );
}
