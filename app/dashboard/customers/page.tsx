"use client";

import { useCustomers, useBulkAddCustomerTag, useBulkRemoveCustomerTag, useDeleteCustomer } from "./hooks/useCustomers";
import { CustomerList } from "./components/CustomerList";
import { CustomerFilters, type CustomerFiltersState } from "./components/CustomerFilters";
import { AddCustomerDialog } from "./components/AddCustomerDialog";
import { DuplicatesAlert } from "./components/DuplicatesAlert";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Search, Plus, Download, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CustomerProfileSheet } from "./components/CustomerProfileSheet";
import type { CustomerListItem } from "@/types/customer";
import { getCustomerDisplayName, getCustomerStatus } from "@/types/customer";
import { exportCustomersCSV } from "./utils/exportCustomers";
import { useLocationStore } from "@/stores/location-store";

type SortField = "name" | "lifetime_spend" | "visits" | "avg_spend" | "last_visit";
type SortDir = "asc" | "desc";

export default function CustomersPage() {
  const { selectedLocationId } = useLocationStore();
  const { data: customers = [], isLoading } = useCustomers({ locationId: selectedLocationId });
  const bulkAddTagMutation = useBulkAddCustomerTag();
  const bulkRemoveTagMutation = useBulkRemoveCustomerTag();
  const deleteCustomerMutation = useDeleteCustomer();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("last_visit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListItem | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerListItem | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isBulkTagDialogOpen, setIsBulkTagDialogOpen] = useState(false);
  const [bulkTagAction, setBulkTagAction] = useState<"add" | "remove">("add");
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [filters, setFilters] = useState<CustomerFiltersState>({
    status: null,
    tags: [],
    spendMin: null,
    spendMax: null,
    lastVisit: null,
    hasEmail: null,
  });

  // Apply search filter
  const searchFilteredData = useMemo(() => {
    if (!searchTerm.trim()) return customers;

    const term = searchTerm.toLowerCase();
    return customers.filter((customer) => {
      const name = getCustomerDisplayName(customer).toLowerCase();
      const email = customer.email?.toLowerCase() || "";
      const phone = customer.phone || "";

      return (
        name.includes(term) || email.includes(term) || phone.includes(term)
      );
    });
  }, [customers, searchTerm]);

  // Apply advanced filters
  const filteredData = useMemo(() => {
    return searchFilteredData.filter((customer) => {
      // Status filter
      if (filters.status) {
        const status = getCustomerStatus(customer);
        if (status !== filters.status) return false;
      }

      // Tags filter
      if (filters.tags.length > 0) {
        const hasAllTags = filters.tags.every((tag) =>
          customer.tags?.includes(tag)
        );
        if (!hasAllTags) return false;
      }

      // Spend filter
      if (filters.spendMin !== null && customer.lifetime_spend < filters.spendMin) {
        return false;
      }
      if (filters.spendMax !== null && customer.lifetime_spend > filters.spendMax) {
        return false;
      }

      // Last visit filter
      if (filters.lastVisit) {
        const days = parseInt(filters.lastVisit, 10);
        if (!customer.last_visit) return false;

        const lastVisitDate = new Date(customer.last_visit);
        const now = new Date();
        const daysSince = Math.floor(
          (now.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSince < days) return false;
      }

      // Email filter
      if (filters.hasEmail !== null) {
        const hasEmail = !!customer.email;
        if (hasEmail !== filters.hasEmail) return false;
      }

      return true;
    });
  }, [searchFilteredData, filters]);

  // Sort customers
  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      // Handle null values
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === "asc" ? 1 : -1;
      if (bVal == null) return sortDir === "asc" ? -1 : 1;

      // Compare values
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      // New field, default to desc
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleBulkTagSubmit = async () => {
    if (!bulkTagValue.trim() || selectedIds.length === 0) return;

    try {
      if (bulkTagAction === "add") {
        await bulkAddTagMutation.mutateAsync({
          customerIds: selectedIds,
          tag: bulkTagValue.trim(),
        });
      } else {
        await bulkRemoveTagMutation.mutateAsync({
          customerIds: selectedIds,
          tag: bulkTagValue.trim(),
        });
      }
      setIsBulkTagDialogOpen(false);
      setBulkTagValue("");
      setSelectedIds([]);
    } catch (error) {
      console.error("Error with bulk tag action:", error);
    }
  };

  const handleViewProfile = (customer: CustomerListItem) => {
    setSelectedCustomer(customer);
    setIsProfileOpen(true);
  };

  const handleDeleteCustomer = (customer: CustomerListItem) => {
    setCustomerToDelete(customer);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;

    try {
      const result = await deleteCustomerMutation.mutateAsync(customerToDelete.id);
      if (result.success) {
        setIsDeleteDialogOpen(false);
        setCustomerToDelete(null);
      } else {
        console.error("Error deleting customer:", result.error);
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
    }
  };

  const selectedCustomers = sortedData.filter((c) =>
    selectedIds.includes(c.id)
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8 px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="space-y-6 pb-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight text-foreground">Customers</h1>
              <p className="text-base text-muted-foreground max-w-2xl">
                Manage your customer database, track their order history, and grow relationships
              </p>
            </div>
            <Button
              size="lg"
              className="gap-2 shadow-md hover:shadow-lg transition-shadow w-full sm:w-auto"
              onClick={() => setIsAddCustomerOpen(true)}
            >
              <Plus className="h-5 w-5" />
              Add Customer
            </Button>
          </div>

          {/* Search Bar */}
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              className="pl-10 py-2.5 text-base rounded-lg border-input bg-card shadow-sm focus-visible:ring-2 focus-visible:ring-primary"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Duplicates Alert */}
        <DuplicatesAlert />

        {/* Filters Section */}
        <div className="bg-card rounded-lg border border-border shadow-sm p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Filters</h3>
            </div>
            <CustomerFilters
              customers={customers}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 p-4 bg-primary/8 border border-primary/30 rounded-lg backdrop-blur-sm">
            <span className="text-sm font-semibold text-foreground">
              {selectedIds.length} customer{selectedIds.length > 1 ? "s" : ""} selected
            </span>
            <div className="flex-1" />
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setBulkTagAction("add");
                  setIsBulkTagDialogOpen(true);
                }}
              >
                <Tag className="h-4 w-4" />
                Add Tag
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setBulkTagAction("remove");
                  setIsBulkTagDialogOpen(true);
                }}
              >
                <X className="h-4 w-4" />
                Remove Tag
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => exportCustomersCSV(selectedCustomers)}
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds([])}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Customer List */}
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden -mx-6 lg:-mx-8">
          <div className="mx-6 lg:mx-8">
            <CustomerList
              customers={sortedData}
              isLoading={isLoading}
              onViewProfile={handleViewProfile}
              onDeleteCustomer={handleDeleteCustomer}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
            />
          </div>
        </div>
      </div>

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={isAddCustomerOpen}
        onOpenChange={setIsAddCustomerOpen}
        onSuccess={() => {
          // Optional: clear search/filters on successful customer creation
        }}
      />

      {/* Bulk Tag Dialog */}
      <Dialog open={isBulkTagDialogOpen} onOpenChange={setIsBulkTagDialogOpen}>
        <DialogContent className="sm:max-w-100">
          <DialogHeader>
            <DialogTitle>
              {bulkTagAction === "add" ? "Add Tag" : "Remove Tag"}
            </DialogTitle>
            <DialogDescription>
              {bulkTagAction === "add"
                ? `Apply a tag to ${selectedIds.length} customer${selectedIds.length > 1 ? "s" : ""}`
                : `Remove a tag from ${selectedIds.length} customer${selectedIds.length > 1 ? "s" : ""}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {bulkTagAction === "remove" ? (
              <Select value={bulkTagValue} onValueChange={setBulkTagValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tag to remove" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(
                    new Set(
                      selectedCustomers.flatMap((c) => c.tags || [])
                    )
                  )
                    .sort()
                    .map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Enter tag name (e.g., VIP)"
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
              />
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkTagDialogOpen(false);
                setBulkTagValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkTagSubmit}
              disabled={!bulkTagValue.trim()}
            >
              {bulkTagAction === "add" ? "Add Tag" : "Remove Tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Profile Sheet */}
      <CustomerProfileSheet
        customer={selectedCustomer}
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
      />

      {/* Delete Customer Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold">{customerToDelete?.name}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteCustomerMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteCustomerMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
