"use client";

import { useState } from "react";
import { AlertCircle, Search, TrendingUp, Banknote } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useFindDuplicateCustomers, useMergeCustomers } from "../hooks/useCustomers";
import type { CustomerListItem } from "@/types/customer";
import { getCustomerDisplayName } from "@/types/customer";

interface DuplicateGroup {
  customers: CustomerListItem[];
  reason: "same_phone" | "similar_name";
}

export function DuplicatesAlert() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const findDuplicatesMutation = useFindDuplicateCustomers();
  const mergeMutation = useMergeCustomers();
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);

  const handleReviewDuplicates = async () => {
    setLoadingDuplicates(true);
    try {
      const result = await findDuplicatesMutation.mutateAsync();
      if (result && Array.isArray(result)) {
        setDuplicateGroups(result);
        setIsSheetOpen(true);
      }
    } catch (error) {
      console.error("Error finding duplicates:", error);
    } finally {
      setLoadingDuplicates(false);
    }
  };

  const handleMergeCustomers = async (
    primaryId: string,
    duplicateIds: string[]
  ) => {
    if (duplicateIds.length === 0) return;

    try {
      await mergeMutation.mutateAsync({
        primaryId,
        duplicateIds,
      });

      // Refresh the duplicate list
      const result = await findDuplicatesMutation.mutateAsync();
      if (result && Array.isArray(result)) {
        setDuplicateGroups(result);
      } else {
        setIsSheetOpen(false);
      }
    } catch (error) {
      console.error("Error merging customers:", error);
    }
  };

  // Only show alert if there are duplicates (when user clicks review)
  if (duplicateGroups.length === 0 && !isSheetOpen) {
    return (
      <Button
        variant="outline"
        size="lg"
        onClick={handleReviewDuplicates}
        disabled={loadingDuplicates}
        className="gap-2 h-11"
      >
        <Search className="h-5 w-5 text-blue-600" />
        {loadingDuplicates ? "Checking..." : "Check for Duplicates"}
      </Button>
    );
  }

  return (
    <>
      {duplicateGroups.length > 0 && !isSheetOpen && (
        <Alert variant="destructive" className="border-destructive/50 bg-destructive/5">
          <AlertCircle className="h-5 w-5" />
          <div className="ml-3 flex-1">
            <AlertTitle className="text-base font-semibold">Possible Duplicates Detected</AlertTitle>
            <AlertDescription className="mt-2 flex items-center justify-between">
              <span className="text-sm">
                Found {duplicateGroups.length} group{duplicateGroups.length > 1 ? "s" : ""} of possible duplicate customers.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsSheetOpen(true)}
                className="ml-4"
              >
                Review
              </Button>
            </AlertDescription>
          </div>
        </Alert>
      )}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader className="space-y-2 pb-4">
            <SheetTitle className="text-2xl font-bold">Review Duplicate Customers</SheetTitle>
            <SheetDescription className="text-base">
              Merge duplicate customer records to keep your database clean and accurate.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-4">
            {duplicateGroups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No duplicate customers found.</p>
              </div>
            ) : (
              duplicateGroups.map((group, index) => (
                <DuplicateGroupCard
                  key={`group-${index}`}
                  group={group}
                  onMerge={handleMergeCustomers}
                  isMerging={mergeMutation.isPending}
                />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

interface DuplicateGroupCardProps {
  group: DuplicateGroup;
  onMerge: (primaryId: string, duplicateIds: string[]) => void;
  isMerging: boolean;
}

function DuplicateGroupCard({
  group,
  onMerge,
  isMerging,
}: DuplicateGroupCardProps) {
  const [primaryId, setPrimaryId] = useState(group.customers[0].id);
  const duplicateIds = group.customers
    .filter((c) => c.id !== primaryId)
    .map((c) => c.id);

  const reasonLabel =
    group.reason === "same_phone" ? "Same Phone" : "Similar Name";

  return (
    <div className="border border-border/50 rounded-lg p-6 space-y-5 bg-card shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground">Duplicate Group</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Reason: <Badge variant="secondary" className="ml-1 inline-block font-semibold">{reasonLabel}</Badge>
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {group.customers.map((customer) => {
          const isSelected = customer.id === primaryId;
          return (
            <button
              key={customer.id}
              onClick={() => setPrimaryId(customer.id)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                isSelected
                  ? "border-primary bg-primary/8 shadow-sm"
                  : "border-border/50 bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">
                    {getCustomerDisplayName(customer)}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    {customer.phone} {customer.email && `• ${customer.email}`}
                  </p>
                  <div className="mt-3 flex gap-3 text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-600" /> {customer.visits} visits</span>
                    <span>•</span>
                    <span className="flex items-center gap-1"><Banknote className="h-3 w-3 text-amber-600" /> ${(customer.lifetime_spend ?? 0).toFixed(2)}</span>
                  </div>
                </div>
                {isSelected && (
                  <div className="flex-shrink-0 pt-1">
                    <Badge className="bg-primary text-primary-foreground font-semibold">
                      ✓ Keep
                    </Badge>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-blue-50/50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100/50 dark:border-blue-900/40 flex gap-3">
        <AlertCircle className="h-5 w-5 text-blue-700 dark:text-blue-300 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
          Select the customer record to keep. Data from other records will be merged into the selected one.
        </p>
      </div>

      <Button
        onClick={() => onMerge(primaryId, duplicateIds)}
        disabled={isMerging || duplicateIds.length === 0}
        className="w-full h-11 font-semibold gap-2"
      >
        {isMerging ? "Merging..." : "Merge Selected"}
      </Button>
    </div>
  );
}