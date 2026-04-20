"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  MoreHorizontal,
  Search,
  Mail,
  MapPin,
  Lock,
  Edit,
  KeyRound,
  UserX,
  UserCheck,
  ArrowUpDown,
  CheckCircle2,
  User,
  ShieldCheck,
  Shield,
  Download,
  Copy,
  X,
  Filter,
} from "lucide-react";
import { UnifiedStaffMember, BulkPinResetResult } from "@/types/staff";
import { BulkPasswordResetResult } from "@/app/dashboard/actions/unified-staff";
import { RolesModel } from "@/types/db-modles";
import {
  useUpdateStaffAssignment,
  useResetStaffPIN,
  useDeactivateStaff,
  useReactivateStaff,
  useUpgradePOSToClerk,
  useDemoteClerkToPOS,
  useBulkDeactivateStaff,
  useBulkResetPINs,
  useBulkResetPasswords,
  useBulkAssignRole,
} from "@/app/dashboard/hooks/useStaff";
import { GetMerchantRoles } from "@/app/dashboard/actions/staff-invite";
import { StaffDetailSheet } from "./StaffDetailSheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";

interface StaffDataTableProps {
  data: UnifiedStaffMember[];
  isLoading?: boolean;
}

export function StaffDataTable({ data, isLoading }: StaffDataTableProps) {
  const { data: userInfo } = useUserInfo();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "inactive">("active");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");

  const [selectedStaff, setSelectedStaff] =
    React.useState<UnifiedStaffMember | null>(null);
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);

  // Upgrade dialog state
  const [upgradeTarget, setUpgradeTarget] =
    React.useState<UnifiedStaffMember | null>(null);
  const [upgradeEmail, setUpgradeEmail] = React.useState("");
  const [isUpgradeOpen, setIsUpgradeOpen] = React.useState(false);

  // Bulk operation state
  const [bulkRoleDialogOpen, setBulkRoleDialogOpen] = React.useState(false);
  const [bulkRoleCode, setBulkRoleCode] = React.useState("");
  const [bulkPinResultsOpen, setBulkPinResultsOpen] = React.useState(false);
  const [bulkPinResults, setBulkPinResults] = React.useState<BulkPinResetResult[]>([]);
  const [bulkPinCustomPin, setBulkPinCustomPin] = React.useState("");
  const [bulkPinConfirmOpen, setBulkPinConfirmOpen] = React.useState(false);
  const [bulkConfirmDeactivateOpen, setBulkConfirmDeactivateOpen] = React.useState(false);
  const [bulkPasswordResultsOpen, setBulkPasswordResultsOpen] = React.useState(false);
  const [bulkPasswordResults, setBulkPasswordResults] = React.useState<BulkPasswordResetResult[]>([]);
  const [bulkPasswordConfirmOpen, setBulkPasswordConfirmOpen] = React.useState(false);
  const [availableRoles, setAvailableRoles] = React.useState<RolesModel[]>([]);

  const updateAssignment = useUpdateStaffAssignment();
  const resetPIN = useResetStaffPIN();
  const deactivateStaff = useDeactivateStaff();
  const reactivateStaff = useReactivateStaff();
  const upgradePOS = useUpgradePOSToClerk();
  const demoteClerk = useDemoteClerkToPOS();
  const bulkDeactivate = useBulkDeactivateStaff();
  const bulkResetPINs = useBulkResetPINs();
  const bulkResetPasswords = useBulkResetPasswords();
  const bulkAssignRole = useBulkAssignRole();

  // Selected member IDs derived from rowSelection
  const selectedMemberIds = React.useMemo(() => {
    return Object.keys(rowSelection).filter((key) => rowSelection[key as keyof typeof rowSelection]);
  }, [rowSelection]);

  const selectedCount = selectedMemberIds.length;

  // Derive unique roles from staff data for the role filter
  const uniqueRoles = React.useMemo(() => {
    const roleMap = new Map<string, string>();
    data.forEach((staff) => {
      const primary = staff.location_assignments?.find((a) => a.is_primary);
      if (primary?.role_code && primary?.role_name) {
        roleMap.set(primary.role_code, primary.role_name);
      }
    });
    return Array.from(roleMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  // Pre-filter data by status and role before passing to table
  const filteredData = React.useMemo(() => {
    let result = data;
    if (statusFilter !== "all") {
      result = result.filter((staff) =>
        statusFilter === "active" ? staff.overall_is_active : !staff.overall_is_active
      );
    }
    if (roleFilter !== "all") {
      result = result.filter((staff) => {
        const primary = staff.location_assignments?.find((a) => a.is_primary);
        return primary?.role_code === roleFilter;
      });
    }
    return result;
  }, [data, statusFilter, roleFilter]);

  // Load roles when bulk role dialog opens
  React.useEffect(() => {
    if (bulkRoleDialogOpen && availableRoles.length === 0) {
      GetMerchantRoles().then((rolesData) => {
        if (Array.isArray(rolesData) && rolesData.length > 0) {
          setAvailableRoles(rolesData);
        }
      });
    }
  }, [bulkRoleDialogOpen, availableRoles.length]);

  // â”€â”€ Bulk handlers â”€â”€
  const handleBulkDeactivate = () => {
    bulkDeactivate.mutate(selectedMemberIds, {
      onSuccess: () => {
        setRowSelection({});
        setBulkConfirmDeactivateOpen(false);
      },
    });
  };

  const handleBulkResetPINs = () => {
    setBulkPinConfirmOpen(true);
  };

  const handleConfirmBulkResetPINs = () => {
    if (bulkPinCustomPin && !/^\d{4,6}$/.test(bulkPinCustomPin)) {
      toast.error("Custom PIN must be 4–6 digits");
      return;
    }
    bulkResetPINs.mutate(
      { memberIds: selectedMemberIds, customPin: bulkPinCustomPin || undefined },
      {
        onSuccess: (result) => {
          if (result.data?.results) {
            setBulkPinResults(result.data.results);
            setBulkPinResultsOpen(true);
          }
          setBulkPinConfirmOpen(false);
          setBulkPinCustomPin("");
          setRowSelection({});
        },
      }
    );
  };

  const handleBulkResetPasswords = () => {
    setBulkPasswordConfirmOpen(true);
  };

  const handleConfirmBulkResetPasswords = () => {
    bulkResetPasswords.mutate(selectedMemberIds, {
      onSuccess: (result) => {
        if (result.data?.results && result.data.results.length > 0) {
          setBulkPasswordResults(result.data.results);
          setBulkPasswordResultsOpen(true);
        }
        setBulkPasswordConfirmOpen(false);
        setRowSelection({});
      },
    });
  };

  const handleBulkAssignRole = () => {
    if (!bulkRoleCode) return;
    bulkAssignRole.mutate(
      { memberIds: selectedMemberIds, roleCode: bulkRoleCode },
      {
        onSuccess: () => {
          setRowSelection({});
          setBulkRoleDialogOpen(false);
          setBulkRoleCode("");
        },
      }
    );
  };

  const handleCopyPinResults = () => {
    const text = bulkPinResults
      .map((r) => `${r.staff_name}: ${r.new_pin}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    toast.success("PINs copied to clipboard");
  };

  const handleDownloadPinResults = () => {
    const csv = ["Name,PIN", ...bulkPinResults.map((r) => `${r.staff_name},${r.new_pin}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pin-reset-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRowClick = (staff: UnifiedStaffMember) => {
    setSelectedStaff(staff);
    setIsDetailOpen(true);
  };

  const handleUpgradeClick = (staff: UnifiedStaffMember) => {
    setUpgradeTarget(staff);
    setUpgradeEmail(staff.email || "");
    setIsUpgradeOpen(true);
  };

  const handleUpgradeSubmit = () => {
    if (!upgradeTarget) return;

    const primaryAssignment = upgradeTarget.location_assignments.find(
      (a) => a.is_primary
    );
    if (!primaryAssignment) {
      toast.error("No primary location found for this staff member");
      return;
    }

    if (!upgradeEmail || !upgradeEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    upgradePOS.mutate(
      {
        memberId: upgradeTarget.member_id,
        locationId: primaryAssignment.location_id,
        email: upgradeEmail,
      },
      {
        onSuccess: () => {
          setIsUpgradeOpen(false);
          setUpgradeTarget(null);
          setUpgradeEmail("");
        },
      }
    );
  };

  const columns: ColumnDef<UnifiedStaffMember>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-[2px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[2px]"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "display_name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="h-8 px-2"
          >
            Employee
            <ArrowUpDown className="ml-2 h-3 w-3" />
          </Button>
        );
      },
      cell: ({ row }) => {
        const staff = row.original;
        const initials = `${staff.first_name?.[0] || ""}${
          staff.last_name?.[0] || ""
        }`.toUpperCase();

        return (
          <div
            className="flex items-center gap-3 cursor-pointer hover:bg-muted/60 rounded-md px-2 py-1 -mx-2"
            onClick={() => handleRowClick(staff)}
          >
            <Avatar className="h-9 w-9">
              <AvatarImage
                src={staff.avatar_url || undefined}
                alt={staff.display_name}
              />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium text-sm">
                {staff.first_name} {staff.last_name}{" "}
                {userInfo?.id == staff.user_id && (
                  <Badge variant="secondary" className="text-xs w-fit">
                    (You)
                  </Badge>
                )}
              </span>
              {staff.email ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {staff.email}
                </span>
              ) : (
                <Badge variant="outline" className="text-xs w-fit">
                  <Lock className="h-2.5 w-2.5 mr-1" />
                  POS Only
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "primary_role",
      header: "Primary Role",
      cell: ({ row }) => {
        const staff = row.original;
        const primaryAssignment =
          staff.location_assignments.find((a) => a.is_primary) ||
          staff.location_assignments[0];

        if (!primaryAssignment) {
          return <span className="text-muted-foreground text-sm">-</span>;
        }

        return (
          <Badge variant="outline" className="text-xs font-mono w-fit">
            {primaryAssignment.role_name || primaryAssignment.role_code || "-"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "locations",
      header: "Locations",
      cell: ({ row }) => {
        const staff = row.original;
        const activeLocations = staff.location_assignments.filter(
          (a) => a.is_active
        );
        const visibleLocations =
          activeLocations.length > 0
            ? activeLocations
            : staff.location_assignments;

        if (visibleLocations.length === 0) {
          return <span className="text-muted-foreground text-sm">None</span>;
        }

        const primaryLocation =
          visibleLocations.find((a) => a.is_primary) || visibleLocations[0];
        const otherLocations = visibleLocations.filter(
          (loc) => loc !== primaryLocation
        );

        return (
          <div className="flex flex-wrap gap-1">
            {primaryLocation && (
              <Badge
                variant={primaryLocation.is_active ? "default" : "outline"}
                className="text-xs gap-1"
              >
                <MapPin className="h-2.5 w-2.5" />
                {primaryLocation.location_name}
                {!primaryLocation.is_active ? " (inactive)" : ""}
              </Badge>
            )}
            {otherLocations.slice(0, 2).map((loc) => (
              <Badge
                key={loc.location_id}
                variant={loc.is_active ? "secondary" : "outline"}
                className="text-xs"
              >
                {loc.location_name}
                {!loc.is_active ? " (inactive)" : ""}
              </Badge>
            ))}
            {otherLocations.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{otherLocations.length - 2} more
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "overall_is_active",
      header: "Status",
      cell: ({ row }) => {
        const staff = row.original;
        const primaryLocation =
          staff.location_assignments.find((a) => a.is_primary) ||
          staff.location_assignments[0];

        const handleToggle = async () => {
          if (!primaryLocation) return;

          if (staff.overall_is_active) {
            deactivateStaff.mutate({
              memberId: staff.member_id,
              locationId: primaryLocation.location_id,
            });
          } else {
            reactivateStaff.mutate({
              memberId: staff.member_id,
              locationId: primaryLocation.location_id,
            });
          }
        };

        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={staff.overall_is_active}
              onCheckedChange={handleToggle}
              disabled={
                !primaryLocation ||
                deactivateStaff.isPending ||
                reactivateStaff.isPending
              }
            />
            <span
              className={cn(
                "text-sm font-medium",
                staff.overall_is_active
                  ? "text-green-600"
                  : "text-muted-foreground"
              )}
            >
              {staff.overall_is_active ? "Active" : "Inactive"}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "pos_access",
      header: "POS Access",
      cell: ({ row }) => {
        const staff = row.original;
        const hasPin = staff.location_assignments.some((a) => a.has_pin);

        return (
          <div className="flex items-center gap-2">
            {hasPin ? (
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">PIN Set</span>
              </div>
            ) : (
              <span className="text-muted-foreground text-sm">No PIN</span>
            )}
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const staff = row.original;
        const primaryLocation =
          staff.location_assignments.find((a) => a.is_primary) ||
          staff.location_assignments[0];

        const handleResetPIN = () => {
          if (!primaryLocation) {
            toast.error("No primary location found");
            return;
          }

          resetPIN.mutate({
            memberId: staff.member_id,
            locationId: primaryLocation.location_id,
          });
        };

        const handleDeactivate = () => {
          if (!primaryLocation) {
            toast.error("No primary location found");
            return;
          }

          if (staff.overall_is_active) {
            deactivateStaff.mutate({
              memberId: staff.member_id,
              locationId: primaryLocation.location_id,
            });
          } else {
            reactivateStaff.mutate({
              memberId: staff.member_id,
              locationId: primaryLocation.location_id,
            });
          }
        };

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleRowClick(staff)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Details
              </DropdownMenuItem>
              {!staff.is_clerk_user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleResetPIN}
                    disabled={!primaryLocation}
                  >
                    <KeyRound className="mr-2 h-4 w-4" />
                    Reset PIN
                  </DropdownMenuItem>
                </>
              )}
              {/* Upgrade to Dashboard User â€” only for POS-only staff */}
              {!staff.is_clerk_user && !staff.user_id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleUpgradeClick(staff)}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Upgrade to Dashboard User
                  </DropdownMenuItem>
                </>
              )}
              {/* Demote to POS-Only â€” only for Clerk staff */}
              {staff.is_clerk_user && staff.user_id && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      if (confirm(`Demote ${staff.display_name} to POS-only? This will revoke their dashboard access.`)) {
                        demoteClerk.mutate(staff.member_id);
                      }
                    }}
                    disabled={demoteClerk.isPending}
                    className="text-orange-600"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Demote to POS-Only
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDeactivate}
                disabled={!primaryLocation}
                className={
                  staff.overall_is_active
                    ? "text-destructive"
                    : "text-green-600"
                }
              >
                {staff.overall_is_active ? (
                  <>
                    <UserX className="mr-2 h-4 w-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Reactivate
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    enableRowSelection: true,
    getRowId: (row) => row.member_id,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
  });

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search staff..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
          <SelectTrigger className="w-[140px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[180px]">
            <Shield className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {uniqueRoles.map(([code, name]) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(statusFilter !== "active" || roleFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter("active");
              setRoleFilter("all");
            }}
          >
            <X className="mr-1 h-4 w-4" />
            Clear filters
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {filteredData.length} of {data.length} staff
        </span>
      </div>

      {/* Bulk Action Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-3">
          <span className="text-sm font-medium mr-2">
            {selectedCount} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkConfirmDeactivateOpen(true)}
            disabled={bulkDeactivate.isPending}
          >
            <UserX className="mr-2 h-4 w-4" />
            Bulk Deactivate
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkResetPINs}
            disabled={bulkResetPINs.isPending}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {bulkResetPINs.isPending ? "Resetting…" : "Bulk PIN Reset"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkResetPasswords}
            disabled={bulkResetPasswords.isPending}
          >
            <Lock className="mr-2 h-4 w-4" />
            {bulkResetPasswords.isPending ? "Resetting…" : "Reset Passwords"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBulkRoleDialogOpen(true)}
            disabled={bulkAssignRole.isPending}
          >
            <Shield className="mr-2 h-4 w-4" />
            Bulk Assign Role
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRowSelection({})}
          >
            <X className="mr-2 h-4 w-4" />
            Clear Selection
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <UserX className="h-8 w-8" />
                    <p>No staff members found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          {selectedCount > 0
            ? `${selectedCount} of ${table.getFilteredRowModel().rows.length} row(s) selected`
            : `Showing ${table.getFilteredRowModel().rows.length} of ${data.length} staff member(s)`}
        </div>
      </div>

      {/* Staff detail sheet */}
      <StaffDetailSheet
        staff={selectedStaff}
        open={isDetailOpen && !!selectedStaff}
        onOpenChange={(open) => {
          setIsDetailOpen(open);
          if (!open) {
            setSelectedStaff(null);
          }
        }}
      />

      {/* Upgrade POS to Dashboard dialog */}
      <Dialog open={isUpgradeOpen} onOpenChange={setIsUpgradeOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Upgrade to Dashboard User</DialogTitle>
            <DialogDescription>
              Promote{" "}
              <span className="font-semibold">
                {upgradeTarget?.first_name} {upgradeTarget?.last_name}
              </span>{" "}
              from POS-only to a full Dashboard user. Their time-clock history
              and POS PIN will be preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="upgrade-email">Email Address</Label>
              <Input
                id="upgrade-email"
                type="email"
                placeholder="user@example.com"
                value={upgradeEmail}
                onChange={(e) => setUpgradeEmail(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                A temporary password will be generated. Share it securely with
                the staff member.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsUpgradeOpen(false)}
              disabled={upgradePOS.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpgradeSubmit}
              disabled={
                upgradePOS.isPending ||
                !upgradeEmail ||
                !upgradeEmail.includes("@")
              }
            >
              {upgradePOS.isPending ? "Upgrading..." : "Upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Confirm Deactivation Dialog */}
      <Dialog open={bulkConfirmDeactivateOpen} onOpenChange={setBulkConfirmDeactivateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Bulk Deactivate Staff</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{" "}
              <span className="font-semibold">{selectedCount}</span> staff
              member(s)? They will lose access to all assigned locations.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkConfirmDeactivateOpen(false)}
              disabled={bulkDeactivate.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDeactivate}
              disabled={bulkDeactivate.isPending}
            >
              {bulkDeactivate.isPending
                ? "Deactivating..."
                : `Deactivate ${selectedCount} Staff`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Role Assignment Dialog */}
      <Dialog
        open={bulkRoleDialogOpen}
        onOpenChange={(open) => {
          setBulkRoleDialogOpen(open);
          if (!open) setBulkRoleCode("");
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Bulk Assign Role</DialogTitle>
            <DialogDescription>
              Assign a new role to{" "}
              <span className="font-semibold">{selectedCount}</span> selected
              staff member(s). This will update their role across all active
              location assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={bulkRoleCode} onValueChange={setBulkRoleCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => (
                    <SelectItem key={role.code} value={role.code}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkRoleDialogOpen(false);
                setBulkRoleCode("");
              }}
              disabled={bulkAssignRole.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkAssignRole}
              disabled={bulkAssignRole.isPending || !bulkRoleCode}
            >
              {bulkAssignRole.isPending
                ? "Assigning..."
                : `Assign to ${selectedCount} Staff`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk PIN Reset — Confirm + Custom PIN Dialog */}
      <Dialog open={bulkPinConfirmOpen} onOpenChange={(open) => { setBulkPinConfirmOpen(open); if (!open) setBulkPinCustomPin(""); }}>
        <DialogContent className="sm:max-w-105">
          <DialogHeader>
            <DialogTitle>Bulk PIN Reset</DialogTitle>
            <DialogDescription>
              Reset PINs for {selectedCount} selected staff member(s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Custom PIN <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="\d{4,6}"
                maxLength={6}
                placeholder="Leave blank to auto-generate"
                value={bulkPinCustomPin}
                onChange={(e) => setBulkPinCustomPin(e.target.value.replace(/\D/g, ""))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                If set, all selected staff will receive this same PIN.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPinConfirmOpen(false)} disabled={bulkResetPINs.isPending}>
              Cancel
            </Button>
            <Button onClick={handleConfirmBulkResetPINs} disabled={bulkResetPINs.isPending}>
              {bulkResetPINs.isPending ? "Resetting…" : "Reset PINs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Password Reset — Confirm Dialog */}
      <Dialog open={bulkPasswordConfirmOpen} onOpenChange={setBulkPasswordConfirmOpen}>
        <DialogContent className="sm:max-w-105">
          <DialogHeader>
            <DialogTitle>Bulk Reset Passwords</DialogTitle>
            <DialogDescription>
              Reset dashboard passwords for {selectedCount} selected staff member(s).
              POS-only staff without dashboard accounts will be skipped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPasswordConfirmOpen(false)} disabled={bulkResetPasswords.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmBulkResetPasswords} disabled={bulkResetPasswords.isPending}>
              {bulkResetPasswords.isPending ? "Resetting…" : "Reset Passwords"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Password Reset Results Dialog */}
      <Dialog
        open={bulkPasswordResultsOpen}
        onOpenChange={(open) => {
          setBulkPasswordResultsOpen(open);
          if (!open) setBulkPasswordResults([]);
        }}
      >
        <DialogContent className="sm:max-w-135">
          <DialogHeader>
            <DialogTitle>Password Reset Results</DialogTitle>
            <DialogDescription>
              New passwords for {bulkPasswordResults.length} dashboard user(s). Share them securely — these are shown only once.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">New Password</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulkPasswordResults.map((result) => (
                  <TableRow key={result.member_id}>
                    <TableCell className="font-medium">{result.staff_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{result.email || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{result.new_password}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => {
                const csv = ["Name,Email,Password", ...bulkPasswordResults.map((r) => `"${r.staff_name}","${r.email}","${r.new_password}"`)].join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `password-reset-${new Date().toISOString().split("T")[0]}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
            <Button onClick={() => setBulkPasswordResultsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk PIN Reset Results Dialog */}
      <Dialog
        open={bulkPinResultsOpen}
        onOpenChange={(open) => {
          setBulkPinResultsOpen(open);
          if (!open) setBulkPinResults([]);
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>PIN Reset Results</DialogTitle>
            <DialogDescription>
              New PINs have been generated for {bulkPinResults.length} staff
              member(s). Save or share them securely with your staff.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Name</TableHead>
                  <TableHead className="text-right">New PIN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bulkPinResults.map((result) => (
                  <TableRow key={result.staff_profile_id}>
                    <TableCell className="font-medium">
                      {result.staff_name}
                    </TableCell>
                    <TableCell className="text-right font-mono text-lg">
                      {result.new_pin}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={handleCopyPinResults}>
              <Copy className="mr-2 h-4 w-4" />
              Copy All
            </Button>
            <Button variant="outline" onClick={handleDownloadPinResults}>
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
            <Button onClick={() => setBulkPinResultsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
