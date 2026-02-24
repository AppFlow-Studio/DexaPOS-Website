"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
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
        size="sm"
        onClick={handleReviewDuplicates}
        disabled={loadingDuplicates}
      >
        {loadingDuplicates ? "Checking..." : "Check for Duplicates"}
      </Button>
    );
  }

  return (
    <>
      {duplicateGroups.length > 0 && !isSheetOpen && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Possible Duplicates Detected</AlertTitle>
          <AlertDescription className="mt-2 flex items-center justify-between">
            <span>
              Found {duplicateGroups.length} group{duplicateGroups.length > 1 ? "s" : ""} of possible
              duplicate customers.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsSheetOpen(true)}
            >
              Review
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Review Duplicate Customers</SheetTitle>
            <SheetDescription>
              Merge duplicate customer records to keep your database clean.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 mt-6">
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
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Duplicate Group</h3>
          <p className="text-sm text-muted-foreground">
            Reason: <Badge variant="outline">{reasonLabel}</Badge>
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
              className={`w-full text-left p-3 rounded-md border-2 transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/50"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium">
                    {getCustomerDisplayName(customer)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {customer.phone} {customer.email && `• ${customer.email}`}
                  </p>
                  <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                    <span>{customer.visits} visits</span>
                    <span>•</span>
                    <span>${(customer.lifetime_spend ?? 0).toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-right">
                  {isSelected && (
                    <Badge className="bg-primary text-primary-foreground">
                      Keep
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-3 text-sm text-blue-700 dark:text-blue-400">
        Select the customer record to keep. Data from other records will be merged
        into this one.
      </div>

      <Button
        onClick={() => onMerge(primaryId, duplicateIds)}
        disabled={isMerging || duplicateIds.length === 0}
        className="w-full"
      >
        {isMerging ? "Merging..." : "Merge Selected"}
      </Button>
    </div>
  );
}