"use client";

import {
  useDevices,
  Device,
  DeviceType,
  getDeviceTypeLabel,
  getDeviceTypeIcon,
} from "./hooks/useDevices";
import { DevicesTable } from "./components/DevicesTable";
import { DeviceCard } from "./components/DeviceCard";
import { AddDeviceDialog } from "./components/AddDeviceDialog";
import { DeviceSearchDialog } from "./components/DeviceSearchDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Empty } from "@/components/ui/empty";
import {
  Plus,
  Search,
  MonitorSmartphone,
  AlertTriangle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { toast } from "sonner";

type SortColumn = "name" | "status" | "alerts" | "lastSeen";
type SortDirection = "asc" | "desc";

const ITEMS_PER_PAGE = 10;

// Device-specific remove messages
const getRemoveMessage = (device: Device): string => {
  switch (device.type) {
    case "printer":
      return "This printer will no longer receive orders. You can add it back later.";
    case "external_terminal":
      return "This terminal will no longer process payments. You can add it back later.";
    case "tablet":
      return "This tablet will be disconnected from your location. You can add it back later.";
    default:
      return "You can add this device back later.";
  }
};

export default function DevicesPage() {
  const { devices, removeDevice, removeMultipleDevices } = useDevices();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [mounted, setMounted] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Selection state
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // Delete confirmation dialog state
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk delete dialog state
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);

  // Command-K search dialog state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Handle hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Command-K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, statusFilter]);

  // Clear selection when page changes
  useEffect(() => {
    // Don't clear selection on page change - only clear when filters change
  }, [currentPage]);

  // Filtered and sorted devices
  const filteredDevices = useMemo(() => {
    let result = [...devices];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (device) =>
          device.name.toLowerCase().includes(term) ||
          device.serialNumber?.toLowerCase().includes(term)
      );
    }

    // Type filter
    if (typeFilter !== "all") {
      result = result.filter((device) => device.type === typeFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((device) => device.status === statusFilter);
    }

    // Sorting
    if (sortColumn) {
      result.sort((a, b) => {
        let comparison = 0;

        switch (sortColumn) {
          case "name":
            comparison = a.name.localeCompare(b.name);
            break;
          case "status":
            comparison = a.status.localeCompare(b.status);
            break;
          case "alerts":
            comparison = a.alerts - b.alerts;
            break;
          case "lastSeen":
            const dateA = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
            const dateB = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
            comparison = dateA - dateB;
            break;
        }

        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [
    devices,
    searchTerm,
    typeFilter,
    statusFilter,
    sortColumn,
    sortDirection,
  ]);

  // Pagination logic
  const totalPages = Math.ceil(filteredDevices.length / ITEMS_PER_PAGE);
  const showPagination = filteredDevices.length > ITEMS_PER_PAGE;
  const paginatedDevices = useMemo(() => {
    if (!showPagination) return filteredDevices;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDevices.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredDevices, currentPage, showPagination]);

  // All device IDs (for select all functionality)
  const allDeviceIds = devices.map((d) => d.id);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction or clear sort
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

  const handleEdit = (device: Device) => {
    setEditingDevice(device);
    setIsAddDialogOpen(true);
  };

  // Single device removal
  const handleRemoveClick = (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (device) {
      setDeviceToDelete(device);
      setIsDeleteDialogOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deviceToDelete) return;

    setIsDeleting(true);
    // Simulate 1 second delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    removeDevice(deviceToDelete.id);
    toast.success(`${deviceToDelete.name} has been removed`);
    setDeviceToDelete(null);
    setIsDeleteDialogOpen(false);
    setIsDeleting(false);

    // Remove from selection if selected
    setSelectedDeviceIds((prev) =>
      prev.filter((id) => id !== deviceToDelete.id)
    );
  };

  const handleCancelDelete = () => {
    if (isDeleting) return; // Don't allow cancel while deleting
    setDeviceToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  // Selection handlers
  const handleSelectDevice = (deviceId: string, selected: boolean) => {
    setSelectedDeviceIds((prev) =>
      selected ? [...prev, deviceId] : prev.filter((id) => id !== deviceId)
    );
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedDeviceIds(allDeviceIds);
    } else {
      setSelectedDeviceIds([]);
    }
  };

  // Bulk delete
  const handleBulkRemoveClick = () => {
    if (selectedDeviceIds.length === 0) return;
    setIsBulkDeleteDialogOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedDeviceIds.length === 0) return;

    setIsBulkDeleting(true);
    // Simulate 1 second delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    removeMultipleDevices(selectedDeviceIds);
    toast.success(`${selectedDeviceIds.length} devices removed`);
    setSelectedDeviceIds([]);
    setIsBulkDeleteDialogOpen(false);
    setIsBulkDeleting(false);
  };

  const handleCancelBulkDelete = () => {
    if (isBulkDeleting) return;
    setIsBulkDeleteDialogOpen(false);
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Device Management
            </h2>
            <p className="text-muted-foreground">
              Configure and monitor your POS terminals, tablets, and printers
            </p>
          </div>
        </div>
        <div className="h-96 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Device Management
          </h2>
          <p className="text-muted-foreground">
            Configure and monitor your POS terminals, tablets, and printers
          </p>
        </div>
        <Button onClick={() => setIsAddDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Device
        </Button>
      </div>

      {/* Filters & Bulk Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1 sm:max-w-[300px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or serial..."
              className="pl-9 pr-16"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search devices"
            />
            {/* Command-K hint button */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="absolute right-2 top-1.5 hidden sm:flex items-center gap-1 px-1.5 py-1 rounded border bg-muted/50 text-xs text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Open quick search (Command K)"
            >
              <kbd className="font-mono text-[10px]">⌘</kbd>
              <kbd className="font-mono text-[10px]">K</kbd>
            </button>
          </div>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Device type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="external_terminal">
                External Terminals
              </SelectItem>
              <SelectItem value="tablet">Tablets</SelectItem>
              <SelectItem value="printer">Printers</SelectItem>
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

        {/* Bulk Actions */}
        {selectedDeviceIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedDeviceIds.length} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkRemoveClick}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove Selected
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      {filteredDevices.length === 0 ? (
        devices.length === 0 ? (
          // No devices at all
          <Empty
            icon={MonitorSmartphone}
            title="No devices connected"
            description="Add your first device to start managing your POS hardware."
            action={
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Device
              </Button>
            }
          />
        ) : (
          // No devices matching filters
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
              onRemove={handleRemoveClick}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              selectedDeviceIds={selectedDeviceIds}
              onSelectDevice={handleSelectDevice}
              onSelectAll={handleSelectAll}
              allDeviceIds={allDeviceIds}
            />
          </div>

          {/* Mobile/Tablet Card View */}
          <div className="lg:hidden grid gap-4 sm:grid-cols-2">
            {paginatedDevices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onEdit={handleEdit}
                onRemove={handleRemoveClick}
                isSelected={selectedDeviceIds.includes(device.id)}
                onSelect={(selected) => handleSelectDevice(device.id, selected)}
              />
            ))}
          </div>

          {/* Pagination */}
          {showPagination && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredDevices.length)}{" "}
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

      {/* Add/Edit Dialog */}
      <AddDeviceDialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) setEditingDevice(null);
        }}
        deviceToEdit={editingDevice}
      />

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setIsDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>
                  Remove &quot;{deviceToDelete?.name}&quot;?
                </AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="pt-3">
              {deviceToDelete && getRemoveMessage(deviceToDelete)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deviceToDelete && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <span className="text-2xl">
                {getDeviceTypeIcon(deviceToDelete.type)}
              </span>
              <div>
                <p className="font-medium">{deviceToDelete.name}</p>
                <p className="text-sm text-muted-foreground">
                  {getDeviceTypeLabel(deviceToDelete.type)}
                  {deviceToDelete.serialNumber &&
                    ` • ${deviceToDelete.serialNumber}`}
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleCancelDelete}
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Device"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!isBulkDeleting) setIsBulkDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle>
                  Remove {selectedDeviceIds.length} devices?
                </AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="pt-3">
              These devices will no longer be connected to your location. This
              action cannot be undone, but you can add them back later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {selectedDeviceIds.length}
              </span>{" "}
              device{selectedDeviceIds.length !== 1 && "s"} will be removed
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleCancelBulkDelete}
              disabled={isBulkDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Devices"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Command-K Search Dialog */}
      <DeviceSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        devices={devices}
      />
    </div>
  );
}
