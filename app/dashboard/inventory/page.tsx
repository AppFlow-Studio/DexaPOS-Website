"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Package,
  Plus,
  Search,
  Truck,
  ShoppingCart,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  LayoutDashboard,
  ArrowUpRight,
  MoreHorizontal,
  Filter,
  Download,
  Boxes,
  DollarSign,
  Globe,
  MapPin,
  Loader2,
  Clock,
  Receipt,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
  Trash2,
  ClipboardList,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useLocationStore, useSelectedLocation } from "@/stores/location-store";
import {
  useInventoryItems,
  useVendors,
  usePurchaseOrders,
  useInventoryStats,
  useUpdatePurchaseOrderStatus,
  useDeleteInventoryItem,
  useDeleteVendor,
  useUpdateStockWithReason,
  useCreateAdhocExpense,
} from "./hooks/useInventoryManagement";
import { GetInventoryItemUsage } from "@/app/dashboard/actions/inventory";
import { AddItemDialog } from "./components/AddItemDialog";
import { AddVendorDialog } from "./components/AddVendorDialog";
import { CreatePurchaseOrderDialog } from "./components/CreatePurchaseOrderDialog";
import { EditItemDialog } from "./components/EditItemDialog";
import { EditVendorDialog } from "./components/EditVendorDialog";
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog";
import { VendorDetailSheet } from "./components/VendorDetailSheet";
import { PurchaseOrderDetailSheet } from "./components/PurchaseOrderDetailSheet";
import { ActivityLogSheet } from "./components/ActivityLogSheet";
import { StockUpdateDialog } from "./components/StockUpdateDialog";
import { CreateExpenseDialog } from "./components/CreateExpenseDialog";
import { WasteTab } from "./components/WasteTab";
import { CountsTab } from "./components/CountsTab";
import { InventoryDashboardTab } from "./components/InventoryDashboardTab";
import { InventoryReportsTab } from "./components/InventoryReportsTab";
import { useUserInfo } from "@/app/manage/hooks/useUserInfo.";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InventoryItemWithVendor } from "@/types/inventory";
import { VendorWithStats } from "./hooks/useInventoryManagement";

// ============================================================================
// COMPONENTS
// ============================================================================

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
  className,
  iconClassName,
  isLoading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
  className?: string;
  iconClassName?: string;
  isLoading?: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5",
        className
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">{value}</p>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  trendUp ? "text-emerald-500" : "text-rose-500"
                )}
              >
                {trendUp ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trend}
              </div>
            )}
          </div>
          <div
            className={cn("p-3 rounded-xl", iconClassName || "bg-primary/10")}
          >
            <Icon
              className={cn(
                "h-6 w-6",
                iconClassName ? "text-white" : "text-primary"
              )}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StockStatusBadge({
  stockMode,
  currentStock,
  reorderPoint,
  isGlobalView,
  locationCount,
  inStockLocations,
  lowStockLocations,
  outOfStockLocations,
}: {
  stockMode: string;
  currentStock: number;
  reorderPoint: number;
  isGlobalView?: boolean;
  locationCount?: number;
  inStockLocations?: number;
  lowStockLocations?: number;
  outOfStockLocations?: number;
}) {
  // ========================================================================
  // GLOBAL VIEW: Show location breakdown
  // ========================================================================
  if (isGlobalView && locationCount !== undefined && locationCount > 0) {
    const total = locationCount;
    const outCount = outOfStockLocations ?? 0;
    const lowCount = lowStockLocations ?? 0;
    const inCount = inStockLocations ?? 0;

    // Priority: Show worst status first
    if (outCount > 0) {
      return (
        <Badge variant="destructive" className="gap-1 text-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
          {outCount}/{total} Out
        </Badge>
      );
    }

    if (lowCount > 0) {
      return (
        <Badge
          variant="outline"
          className="border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1 text-xs"
        >
          <AlertTriangle className="h-3 w-3" />
          {lowCount}/{total} Low
        </Badge>
      );
    }

    // All locations in stock
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/50 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-xs"
      >
        {inCount}/{total} In Stock
      </Badge>
    );
  }

  // ========================================================================
  // LOCATION VIEW / FALLBACK: Show simple status
  // ========================================================================
  if (stockMode === "out_of_stock") {
    return (
      <Badge variant="destructive" className="gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        Out of Stock
      </Badge>
    );
  }

  if (stockMode === "in_stock") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/50 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
      >
        In Stock
      </Badge>
    );
  }

  // stock_tracking mode
  if (currentStock === 0) {
    return (
      <Badge variant="destructive" className="gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
        Out of Stock
      </Badge>
    );
  }

  if (currentStock <= reorderPoint) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/50 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-1"
      >
        <AlertTriangle className="h-3 w-3" />
        Low Stock
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-emerald-500/50 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
    >
      In Stock
    </Badge>
  );
}

function ScopeBadge({ locationId }: { locationId: string | null }) {
  if (!locationId) {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-xs text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30"
      >
        <Globe className="h-3 w-3" />
        Global
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <MapPin className="h-3 w-3" />
      Local
    </Badge>
  );
}

function POStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-secondary text-secondary-foreground",
    pending:
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    received:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    paid: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    cancelled:
      "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 border-rose-200 dark:border-rose-800",
  };

  return (
    <Badge
      variant="outline"
      className={cn("capitalize", styles[status] || styles.draft)}
    >
      {status}
    </Badge>
  );
}

function StockEditCell({
  currentStock,
  unitType,
  isGlobalView,
  locationCount,
  onEdit,
}: {
  currentStock: number;
  unitType: string;
  isGlobalView?: boolean;
  locationCount?: number;
  onEdit?: () => void;
}) {
  // Global view: Show aggregate with indicator, not editable
  if (isGlobalView) {
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="font-medium">{currentStock}</span>
          <span className="text-muted-foreground text-sm">{unitType}</span>
        </div>
        {locationCount !== undefined && locationCount > 0 && (
          <span className="text-xs text-muted-foreground">
            (across {locationCount} location{locationCount !== 1 ? "s" : ""})
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 cursor-pointer group"
      onClick={onEdit}
    >
      <span className="font-medium">{currentStock}</span>
      <span className="text-muted-foreground text-sm">{unitType}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
      >
        Edit
      </Button>
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

type SortField = "name" | "stock" | "cost" | "category";
type SortDir = "asc" | "desc";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("catalog");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Applied filter state (drives the table)
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterStockModes, setFilterStockModes] = useState<string[]>([]);
  const [filterScope, setFilterScope] = useState<"all" | "global" | "local">("all");

  // Pending filter state (shown inside the popover until Apply is clicked)
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);
  const [pendingStockModes, setPendingStockModes] = useState<string[]>([]);
  const [pendingScope, setPendingScope] = useState<"all" | "global" | "local">("all");

  const [filterOpen, setFilterOpen] = useState(false);
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);
  const [isCreatePOOpen, setIsCreatePOOpen] = useState(false);

  // Usage check state
  const [usageData, setUsageData] = useState<{
    menuItems: string[];
    modifierItems: string[];
  } | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  // Edit dialog state
  const [editingItem, setEditingItem] =
    useState<InventoryItemWithVendor | null>(null);
  const [editingVendor, setEditingVendor] = useState<VendorWithStats | null>(
    null
  );

  // Delete confirmation state
  const [deleteItemTarget, setDeleteItemTarget] =
    useState<InventoryItemWithVendor | null>(null);
  const [deleteVendorTarget, setDeleteVendorTarget] =
    useState<VendorWithStats | null>(null);

  // Detail sheet state
  const [selectedDetailVendor, setSelectedDetailVendor] =
    useState<VendorWithStats | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);

  // PO Detail sheet state
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
  const [isPODetailOpen, setIsPODetailOpen] = useState(false);

  // Activity Log sheet state
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);

  // Stock Update dialog state
  const [stockUpdateItem, setStockUpdateItem] =
    useState<InventoryItemWithVendor | null>(null);

  // Expense dialog state
  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);

  const { data: userInfo } = useUserInfo();
  const clerkOrgId = userInfo?.members?.[0]?.organizations?.id;
  const { selectedLocationId } = useLocationStore();
  const selectedLocation = useSelectedLocation();
  const isAllLocations = selectedLocationId === "all" || !selectedLocationId;

  // Data hooks
  const { data: items = [], isLoading: isLoadingItems } = useInventoryItems();
  const { data: vendors = [], isLoading: isLoadingVendors } = useVendors();
  const { data: purchaseOrders = [], isLoading: isLoadingPOs } =
    usePurchaseOrders();
  const { data: stats, isLoading: isLoadingStats } = useInventoryStats();

  // Mutations
  const deleteItem = useDeleteInventoryItem();
  const deleteVendor = useDeleteVendor();
  const updatePOStatus = useUpdatePurchaseOrderStatus();
  const updateStockWithReason = useUpdateStockWithReason();
  const createAdhocExpense = useCreateAdhocExpense();

  // Derive available categories from actual data
  const availableCategories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort(),
    [items]
  );

  const activeFilterCount =
    filterCategories.length +
    filterStockModes.length +
    (filterScope !== "all" ? 1 : 0);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const clearFilters = () => {
    setFilterCategories([]);
    setFilterStockModes([]);
    setFilterScope("all");
    setPendingCategories([]);
    setPendingStockModes([]);
    setPendingScope("all");
  };

  const handleFilterOpenChange = (open: boolean) => {
    if (open) {
      // Sync applied → pending when opening
      setPendingCategories(filterCategories);
      setPendingStockModes(filterStockModes);
      setPendingScope(filterScope);
    }
    setFilterOpen(open);
  };

  const applyFilters = () => {
    setFilterCategories(pendingCategories);
    setFilterStockModes(pendingStockModes);
    setFilterScope(pendingScope);
    setFilterOpen(false);
  };

  const cancelFilters = () => {
    // Reset pending back to applied and close
    setPendingCategories(filterCategories);
    setPendingStockModes(filterStockModes);
    setPendingScope(filterScope);
    setFilterOpen(false);
  };

  const toggleCategory = (cat: string) =>
    setPendingCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );

  const toggleStockMode = (mode: string) =>
    setPendingStockModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );

  // Filter + sort items
  const filteredItems = useMemo(() => {
    const search = searchTerm.toLowerCase();
    let result = items.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search) ||
        item.sku?.toLowerCase().includes(search) ||
        item.category?.toLowerCase().includes(search);
      const matchesCategory =
        filterCategories.length === 0 ||
        (item.category != null && filterCategories.includes(item.category));
      const matchesMode =
        filterStockModes.length === 0 || filterStockModes.includes(item.stock_mode);
      const matchesScope =
        filterScope === "all" ||
        (filterScope === "global" && item.location_id == null) ||
        (filterScope === "local" && item.location_id != null);
      return matchesSearch && matchesCategory && matchesMode && matchesScope;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "stock") cmp = (a.current_stock ?? 0) - (b.current_stock ?? 0);
      else if (sortField === "cost") cmp = (a.cost_per_unit ?? 0) - (b.cost_per_unit ?? 0);
      else if (sortField === "category")
        cmp = (a.category ?? "").localeCompare(b.category ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, searchTerm, filterCategories, filterStockModes, filterScope, sortField, sortDir]);

  const filteredVendors = vendors.filter((vendor) =>
    vendor.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPOs = purchaseOrders.filter(
    (po) =>
      po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.vendor?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getAddButtonAction = () => {
    switch (activeTab) {
      case "catalog":
        return () => setIsAddItemOpen(true);
      case "vendors":
        return () => setIsAddVendorOpen(true);
      case "purchase-orders":
        return () => setIsCreatePOOpen(true);
      default:
        return () => {};
    }
  };

  const getAddButtonLabel = () => {
    switch (activeTab) {
      case "catalog":
        return "Add Item";
      case "vendors":
        return "Add Vendor";
      case "purchase-orders":
        return "Create Order";
      default:
        return "Add";
    }
  };

  // Fetch usage when delete target changes
  useEffect(() => {
    if (deleteItemTarget) {
      setIsLoadingUsage(true);
      GetInventoryItemUsage(deleteItemTarget.id)
        .then((data) => setUsageData(data))
        .catch((err) => console.error(err))
        .finally(() => setIsLoadingUsage(false));
    } else {
      setUsageData(null);
    }
  }, [deleteItemTarget]);

  const deleteDescription = useMemo(() => {
    if (isLoadingUsage) return "Checking item usage...";

    const menuCount = usageData?.menuItems.length || 0;
    const modCount = usageData?.modifierItems.length || 0;
    const totalCount = menuCount + modCount;

    if (totalCount === 0) {
      return "This action cannot be undone. This will permanently delete the item and remove it from our servers.";
    }

    const allItems = [
      ...(usageData?.menuItems.map((n) => `${n} (Menu)`) || []),
      ...(usageData?.modifierItems.map((n) => `${n} (Modifier)`) || []),
    ];

    const displayItems = allItems.slice(0, 5);
    const remaining = totalCount - 5;

    return (
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="font-medium">
            This item is used in {totalCount} recipe
            {totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <p className="text-muted-foreground">
          Deleting it will remove it from the following recipes:
        </p>
        <ul className="list-disc pl-5 space-y-1 text-foreground font-medium">
          {displayItems.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
          {remaining > 0 && (
            <li className="text-muted-foreground italic">
              ...and {remaining} more
            </li>
          )}
        </ul>
        <p className="text-destructive font-medium pt-2">
          Are you sure you want to proceed?
        </p>
      </div>
    );
  }, [isLoadingUsage, usageData]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
            Inventory Management
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAllLocations
              ? "Managing global inventory catalog and vendors"
              : `Managing inventory for ${
                  selectedLocation?.name || "selected location"
                }`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setIsActivityLogOpen(true)}
          >
            <Clock className="h-4 w-4" />
            Activity Log
          </Button>
          {!isAllLocations && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setIsExpenseDialogOpen(true)}
            >
              <Receipt className="h-4 w-4" />
              Log Expense
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          {activeTab !== "waste" &&
            activeTab !== "counts" &&
            activeTab !== "dashboard" &&
            activeTab !== "reports" && (
            <Button
              className="gap-2 shadow-lg shadow-primary/25"
              onClick={getAddButtonAction()}
            >
              <Plus className="h-4 w-4" />
              {getAddButtonLabel()}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Items"
          value={stats?.totalItems || 0}
          subtitle={
            isAllLocations
              ? "Global catalog items"
              : "Available at this location"
          }
          icon={Package}
          isLoading={isLoadingStats}
        />
        <StatCard
          title="Low Stock"
          value={stats?.lowStock || 0}
          subtitle={
            isAllLocations
              ? `Location${
                  (stats?.lowStock || 0) !== 1 ? "s" : ""
                } with low stock`
              : "Need reordering"
          }
          icon={AlertTriangle}
          iconClassName="bg-amber-500"
          isLoading={isLoadingStats}
        />
        <StatCard
          title="Out of Stock"
          value={stats?.outOfStock || 0}
          subtitle={
            isAllLocations
              ? `Location${
                  (stats?.outOfStock || 0) !== 1 ? "s" : ""
                } with out of stock`
              : "Immediate action needed"
          }
          icon={TrendingDown}
          iconClassName="bg-rose-500"
          isLoading={isLoadingStats}
        />
        <StatCard
          title="Inventory Value"
          value={`$${(stats?.totalValue || 0).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          subtitle={
            isAllLocations
              ? "Total across all locations"
              : "Current location value"
          }
          icon={DollarSign}
          iconClassName="bg-emerald-500"
          isLoading={isLoadingStats}
        />
      </div>

      {/* Main Content with Tabs */}
      <Card className="border-0 shadow-xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <CardHeader className="pb-0 border-b">
            <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:justify-between min-w-0">
              <TabsList className="bg-muted/50 p-1 h-auto max-w-full flex-nowrap justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsTrigger
                  value="catalog"
                  className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
                >
                  <Boxes className="h-4 w-4" />
                  Catalog
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-xs"
                  >
                    {items.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="vendors"
                  className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
                >
                  <Truck className="h-4 w-4" />
                  Vendors
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-xs"
                  >
                    {vendors.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="purchase-orders"
                  className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Purchase Orders
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-xs"
                  >
                    {purchaseOrders.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="waste"
                  className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Waste
                </TabsTrigger>
                <TabsTrigger
                  value="counts"
                  className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
                >
                  <ClipboardList className="h-4 w-4" />
                  Counts
                </TabsTrigger>
                <TabsTrigger
                  value="dashboard"
                  className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger
                  value="reports"
                  className="gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm px-4 py-2"
                >
                  <TrendingUp className="h-4 w-4" />
                  Reports
                </TabsTrigger>
              </TabsList>

              {(activeTab === "catalog" ||
                activeTab === "vendors" ||
                activeTab === "purchase-orders") && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-64 bg-background"
                  />
                </div>
                <Popover open={filterOpen} onOpenChange={handleFilterOpenChange}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 relative">
                      <Filter className="h-4 w-4" />
                      Filters
                      {activeFilterCount > 0 && (
                        <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full bg-primary text-primary-foreground">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-0">
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                      <span className="text-sm font-semibold">Filters</span>
                      {(pendingCategories.length > 0 || pendingStockModes.length > 0 || pendingScope !== "all") && (
                        <button
                          onClick={() => {
                            setPendingCategories([]);
                            setPendingStockModes([]);
                            setPendingScope("all");
                          }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="h-3 w-3" />
                          Clear all
                        </button>
                      )}
                    </div>

                    <div className="p-4 space-y-5">
                      {/* Category */}
                      {availableCategories.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</p>
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {availableCategories.map((cat) => (
                              <label key={cat} className="flex items-center gap-2 cursor-pointer group">
                                <Checkbox
                                  checked={pendingCategories.includes(cat)}
                                  onCheckedChange={() => toggleCategory(cat)}
                                />
                                <span className="text-sm group-hover:text-foreground transition-colors">{cat}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <Separator />

                      {/* Stock Mode */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stock Mode</p>
                        <div className="space-y-1.5">
                          {[
                            { value: "in_stock", label: "Always In Stock" },
                            { value: "stock_tracking", label: "Tracked" },
                            { value: "out_of_stock", label: "Out of Stock" },
                          ].map((mode) => (
                            <label key={mode.value} className="flex items-center gap-2 cursor-pointer group">
                              <Checkbox
                                checked={pendingStockModes.includes(mode.value)}
                                onCheckedChange={() => toggleStockMode(mode.value)}
                              />
                              <span className="text-sm group-hover:text-foreground transition-colors">{mode.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      {/* Scope */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scope</p>
                        <div className="flex gap-2">
                          {(["all", "global", "local"] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setPendingScope(s)}
                              className={cn(
                                "flex-1 py-1.5 text-xs rounded-md border transition-colors capitalize",
                                pendingScope === s
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border hover:bg-muted"
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Apply / Cancel */}
                    <div className="flex gap-2 px-4 py-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={cancelFilters}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={applyFilters}
                      >
                        Apply Filters
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {/* Catalog Tab */}
            <TabsContent value="catalog" className="m-0">
              {isLoadingItems ? (
                <div className="p-8 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded-xl" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No items found</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    {searchTerm || activeFilterCount > 0
                      ? "Try adjusting your search or filters"
                      : "Get started by adding your first inventory item"}
                  </p>
                  {(searchTerm || activeFilterCount > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => { setSearchTerm(""); clearFilters(); }}
                    >
                      Clear search & filters
                    </Button>
                  )}
                  {!searchTerm && activeFilterCount === 0 && (
                    <Button
                      className="mt-4 gap-2"
                      onClick={() => setIsAddItemOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Add First Item
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-sm font-medium text-muted-foreground">
                    {(
                      [
                        { label: "Item", field: "name" as const, span: "col-span-4" },
                        { label: "Stock", field: "stock" as const, span: "col-span-2" },
                        { label: "Status", field: null, span: "col-span-2" },
                        { label: "Cost", field: "cost" as const, span: "col-span-2" },
                        { label: "Scope", field: null, span: "col-span-2" },
                      ] as { label: string; field: SortField | null; span: string }[]
                    ).map(({ label, field, span }) =>
                      field ? (
                        <button
                          key={label}
                          onClick={() => handleSort(field)}
                          className={cn(
                            span,
                            "flex items-center gap-1 hover:text-foreground transition-colors text-left"
                          )}
                        >
                          {label}
                          {sortField === field ? (
                            sortDir === "asc" ? (
                              <ChevronUp className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-primary" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <div key={label} className={span}>
                          {label}
                        </div>
                      )
                    )}
                  </div>

                  {/* Table Rows */}
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group"
                    >
                      <div className="col-span-4">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                            <Package className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.sku || "No SKU"}{" "}
                              {item.category && `• ${item.category}`}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="col-span-2">
                        {item.stock_mode === "stock_tracking" ? (
                          <StockEditCell
                            currentStock={item.current_stock}
                            unitType={item.unit_type}
                            isGlobalView={isAllLocations}
                            locationCount={(item as any).location_count}
                            onEdit={() => setStockUpdateItem(item)}
                          />
                        ) : (
                          <span className="text-muted-foreground text-sm italic">
                            {item.stock_mode === "in_stock"
                              ? "Not tracked"
                              : "N/A"}
                          </span>
                        )}
                      </div>

                      <div className="col-span-2">
                        {isAllLocations ? (
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        ) : (
                          <StockStatusBadge
                            stockMode={item.stock_mode}
                            currentStock={item.current_stock}
                            reorderPoint={
                              item.reorder_threshold ?? item.reorder_point
                            }
                          />
                        )}
                      </div>

                      <div className="col-span-2">
                        <span className="font-medium">
                          ${item.cost_per_unit.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          /{item.unit_type}
                        </span>
                      </div>

                      <div className="col-span-2 flex items-center justify-between">
                        <ScopeBadge locationId={item.location_id} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setEditingItem(item)}
                            >
                              Edit Item
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* Only allow delete if not a global item when in location view */}
                            {isAllLocations || item.location_id !== null ? (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteItemTarget(item)}
                              >
                                Delete Item
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                disabled
                                className="text-muted-foreground"
                              >
                                Cannot delete global item
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Vendors Tab */}
            <TabsContent value="vendors" className="m-0">
              {isLoadingVendors ? (
                <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i}>
                      <CardContent className="p-5">
                        <Skeleton className="h-10 w-10 rounded-xl mb-4" />
                        <Skeleton className="h-5 w-32 mb-2" />
                        <Skeleton className="h-4 w-24" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredVendors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <Truck className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    No vendors found
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    Add your suppliers to track orders and spending
                  </p>
                  <Button
                    className="mt-4 gap-2"
                    onClick={() => setIsAddVendorOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Add Vendor
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredVendors.map((vendor) => (
                    <Card
                      key={vendor.id}
                      className="group hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer border-muted"
                      onClick={() => {
                        setSelectedDetailVendor(vendor);
                        setIsDetailSheetOpen(true);
                      }}
                    >
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/10">
                            <Truck className="h-5 w-5 text-blue-500" />
                          </div>
                          <div className="flex items-center gap-2">
                            <ScopeBadge locationId={vendor.location_id} />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => setEditingVendor(vendor)}
                                >
                                  Edit Vendor
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {/* Only allow delete if not a global vendor when in location view */}
                                {isAllLocations ||
                                vendor.location_id !== null ? (
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() =>
                                      setDeleteVendorTarget(vendor)
                                    }
                                  >
                                    Delete Vendor
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    disabled
                                    className="text-muted-foreground"
                                  >
                                    Cannot delete global vendor
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        <h3 className="font-semibold text-lg mb-1">
                          {vendor.name}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          {vendor.contact_name || "No contact"}
                        </p>

                        <div className="flex items-center justify-between pt-4 border-t">
                          <div>
                            <p className="text-2xl font-bold">
                              {vendor.total_orders}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Orders
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-emerald-600">
                              ${vendor.total_spend.toLocaleString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Total Spend
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {/* Add Vendor Card */}
                  <Card
                    className="border-dashed border-2 hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setIsAddVendorOpen(true)}
                  >
                    <CardContent className="p-5 flex flex-col items-center justify-center h-full min-h-[200px] text-center">
                      <div className="p-3 rounded-full bg-muted mb-3">
                        <Plus className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="font-medium">Add New Vendor</p>
                      <p className="text-sm text-muted-foreground">
                        Track your suppliers
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* Purchase Orders Tab */}
            <TabsContent value="purchase-orders" className="m-0">
              {isLoadingPOs ? (
                <div className="p-8 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredPOs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    No purchase orders
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    {isAllLocations
                      ? "Select a specific location to create purchase orders"
                      : "Create your first purchase order to restock inventory"}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Table Header */}
                  <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-muted/30 text-sm font-medium text-muted-foreground">
                    <div
                      className={isAllLocations ? "col-span-2" : "col-span-3"}
                    >
                      PO Number
                    </div>
                    {isAllLocations && (
                      <div className="col-span-2">Location</div>
                    )}
                    <div className="col-span-3">Vendor</div>
                    <div className="col-span-2">Status</div>
                    <div
                      className={isAllLocations ? "col-span-1" : "col-span-2"}
                    >
                      Items
                    </div>
                    <div className="col-span-2">Total</div>
                  </div>

                  {/* Table Rows */}
                  {filteredPOs.map((po) => (
                    <div
                      key={po.id}
                      className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-muted/30 transition-colors group cursor-pointer"
                      onClick={() => {
                        setSelectedPOId(po.id);
                        setIsPODetailOpen(true);
                      }}
                    >
                      <div
                        className={isAllLocations ? "col-span-2" : "col-span-3"}
                      >
                        <p className="font-medium font-mono">{po.po_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(po.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      {isAllLocations && (
                        <div className="col-span-2">
                          <p className="text-sm font-medium">
                            {po.location?.name || "Unknown"}
                          </p>
                        </div>
                      )}

                      <div className="col-span-3">
                        <p className="font-medium">
                          {po.vendor?.name || "Unknown Vendor"}
                        </p>
                      </div>

                      <div className="col-span-2">
                        <POStatusBadge status={po.status} />
                      </div>

                      <div className="col-span-2">
                        <span className="font-medium">
                          {po.items?.length || 0}
                        </span>
                        <span className="text-muted-foreground text-sm">
                          {" "}
                          items
                        </span>
                      </div>

                      <div className="col-span-2 flex items-center justify-between">
                        <span className="font-semibold">
                          ${po.total_amount.toFixed(2)}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {po.status === "draft" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  updatePOStatus.mutate({
                                    poId: po.id,
                                    status: "pending",
                                  })
                                }
                              >
                                Submit Order
                              </DropdownMenuItem>
                            )}
                            {po.status === "pending" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  // Set all quantities received to ordered
                                  const quantities: Record<string, number> = {};
                                  po.items?.forEach((item) => {
                                    quantities[item.id] = item.quantity_ordered;
                                  });
                                  updatePOStatus.mutate({
                                    poId: po.id,
                                    status: "received",
                                    receivedQuantities: quantities,
                                  });
                                }}
                              >
                                Mark as Received
                              </DropdownMenuItem>
                            )}
                            {po.status === "received" && (
                              <DropdownMenuItem
                                onClick={() =>
                                  updatePOStatus.mutate({
                                    poId: po.id,
                                    status: "paid",
                                  })
                                }
                              >
                                Mark as Paid
                              </DropdownMenuItem>
                            )}
                            {po.status === "draft" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() =>
                                    updatePOStatus.mutate({
                                      poId: po.id,
                                      status: "cancelled",
                                    })
                                  }
                                >
                                  Cancel Order
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Actions for PO */}
              {(filteredPOs.length > 0 || !isAllLocations) && (
                <div className="p-6 border-t bg-muted/20">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      {filteredPOs.length > 0
                        ? `Showing ${filteredPOs.length} purchase order${
                            filteredPOs.length !== 1 ? "s" : ""
                          }`
                        : "No purchase orders yet"}
                    </p>
                    {!isAllLocations && (
                      <Button
                        className="gap-2"
                        onClick={() => setIsCreatePOOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        Create New Order
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Waste Tab */}
            <TabsContent value="waste" className="m-0">
              <WasteTab items={items} isAllLocations={isAllLocations} />
            </TabsContent>

            {/* Counts Tab */}
            <TabsContent value="counts" className="m-0">
              <CountsTab items={items} isAllLocations={isAllLocations} />
            </TabsContent>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="m-0">
              <InventoryDashboardTab isAllLocations={isAllLocations} />
            </TabsContent>

            {/* Reports Tab */}
            <TabsContent value="reports" className="m-0">
              <InventoryReportsTab isAllLocations={isAllLocations} />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* Dialogs */}
      <AddItemDialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen} />
      <AddVendorDialog
        open={isAddVendorOpen}
        onOpenChange={setIsAddVendorOpen}
      />
      <CreatePurchaseOrderDialog
        open={isCreatePOOpen}
        onOpenChange={setIsCreatePOOpen}
      />

      {/* Edit Dialogs */}
      <EditItemDialog
        open={!!editingItem}
        onOpenChange={(open) => !open && setEditingItem(null)}
        item={editingItem}
      />
      <EditVendorDialog
        open={!!editingVendor}
        onOpenChange={(open) => !open && setEditingVendor(null)}
        vendor={editingVendor}
      />

      {/* Delete Confirmation Dialogs */}
      <DeleteConfirmDialog
        open={!!deleteItemTarget}
        onOpenChange={(open) => !open && setDeleteItemTarget(null)}
        title={
          deleteItemTarget
            ? `Delete "${deleteItemTarget.name}"?`
            : "Delete Item"
        }
        description={deleteDescription}
        onConfirm={() => {
          if (deleteItemTarget) {
            deleteItem.mutate(deleteItemTarget.id, {
              onSuccess: () => setDeleteItemTarget(null),
            });
          }
        }}
        isLoading={deleteItem.isPending || isLoadingUsage}
      />
      <DeleteConfirmDialog
        open={!!deleteVendorTarget}
        onOpenChange={(open) => !open && setDeleteVendorTarget(null)}
        title="Delete Vendor"
        description={`Are you sure you want to delete "${deleteVendorTarget?.name}"? This action cannot be undone.`}
        onConfirm={() => {
          if (deleteVendorTarget) {
            deleteVendor.mutate(deleteVendorTarget.id, {
              onSuccess: () => setDeleteVendorTarget(null),
            });
          }
        }}
        isLoading={deleteVendor.isPending}
      />

      <VendorDetailSheet
        vendor={selectedDetailVendor}
        open={isDetailSheetOpen}
        onOpenChange={setIsDetailSheetOpen}
        clerkOrgId={clerkOrgId || ""}
      />

      <PurchaseOrderDetailSheet
        open={isPODetailOpen}
        onOpenChange={setIsPODetailOpen}
        purchaseOrderId={selectedPOId}
      />

      {/* Activity Log Sheet */}
      <ActivityLogSheet
        open={isActivityLogOpen}
        onOpenChange={setIsActivityLogOpen}
      />

      {/* Stock Update Dialog */}
      <StockUpdateDialog
        open={!!stockUpdateItem}
        onOpenChange={(open) => !open && setStockUpdateItem(null)}
        itemName={stockUpdateItem?.name || ""}
        currentStock={stockUpdateItem?.current_stock || 0}
        unitType={stockUpdateItem?.unit_type || "units"}
        onConfirm={async (newStock, reason, source) => {
          if (stockUpdateItem) {
            await updateStockWithReason.mutateAsync({
              itemId: stockUpdateItem.id,
              newStock,
              reason,
              source: source as "manual" | "adjustment" | "waste" | "transfer",
            });
            setStockUpdateItem(null);
          }
        }}
        isPending={updateStockWithReason.isPending}
      />

      {/* Create Expense Dialog */}
      <CreateExpenseDialog
        open={isExpenseDialogOpen}
        onOpenChange={setIsExpenseDialogOpen}
        onSubmit={async (expense) => {
          await createAdhocExpense.mutateAsync(expense);
        }}
        isPending={createAdhocExpense.isPending}
      />
    </div>
  );
}
