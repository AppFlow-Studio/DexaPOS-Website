"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Search, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  searchCustomersForOrder,
  assignCustomerToOrder,
  type CustomerSearchHit,
} from "@/app/actions/orders/assign-customer";
import type { OrderResponse } from "@/types/order-management";

const DEBOUNCE_MS = 300;

export interface AssignCustomerModalProps {
  order: OrderResponse & { merchant_id?: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function formatCustomerLine(c: CustomerSearchHit): string {
  const parts = [c.name || "No name"].filter(Boolean);
  if (c.phone) parts.push(`(${c.phone})`);
  if (c.email) parts.push(c.email);
  return parts.join(" · ");
}

export function AssignCustomerModal({
  order,
  open,
  onOpenChange,
  onSuccess,
}: AssignCustomerModalProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<CustomerSearchHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [createNew, setCreateNew] = React.useState(false);
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerSearchHit | null>(null);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const orderId = order?.id;
  const hasSelection = selectedCustomer !== null || (createNew && newName.trim());

  const queryVersionRef = React.useRef(0);

  const runSearch = React.useCallback(
    async (q: string) => {
      if (!orderId || !q.trim()) {
        setSearchResults([]);
        return;
      }
      const version = ++queryVersionRef.current;
      setSearching(true);
      try {
        const data = await searchCustomersForOrder(orderId, q);
        // Ignore response if the user has typed a different query
        if (version === queryVersionRef.current) {
          setSearchResults(data);
        }
      } finally {
        if (version === queryVersionRef.current) {
          setSearching(false);
        }
      }
    },
    [orderId]
  );

  // Clear stale results as soon as the query changes (don't wait for debounce)
  React.useEffect(() => {
    if (searchQuery.trim()) {
      setSearchResults([]);
    }
  }, [searchQuery]);

  React.useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      runSearch(searchQuery);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, searchQuery, runSearch]);

  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSearchResults([]);
      setCreateNew(false);
      setSelectedCustomer(null);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
    }
  }, [open]);

  const handleSelectCustomer = (c: CustomerSearchHit) => {
    setSelectedCustomer(c);
    setCreateNew(false);
  };

  const handleCreateNew = () => {
    setCreateNew(true);
    setSelectedCustomer(null);
  };

  const handleAssign = async () => {
    if (!orderId) return;
    if (!hasSelection) {
      toast.error("Select a customer or create a new one.");
      return;
    }

    setSubmitting(true);
    try {
      let result;
      if (createNew) {
        if (!newName.trim()) {
          toast.error("Name is required for new customer.");
          setSubmitting(false);
          return;
        }
        result = await assignCustomerToOrder({
          orderId,
          newCustomer: {
            name: newName.trim(),
            phone: newPhone.trim() || undefined,
            email: newEmail.trim() || undefined,
          },
        });
      } else if (selectedCustomer) {
        result = await assignCustomerToOrder({
          orderId,
          customerId: selectedCustomer.id,
        });
      } else {
        setSubmitting(false);
        return;
      }

      if (result.success) {
        toast.success(
          createNew ? "Customer created and assigned." : "Customer assigned to order."
        );
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Failed to assign customer");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        elevation="high"
        showCloseButton={true}
      >
        <DialogHeader>
          <DialogTitle>Assign Customer</DialogTitle>
          <DialogDescription>
            Search for an existing customer or create a new one to attach to this order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Results */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Results</p>
            <div
              className={cn(
                "border rounded-md min-h-[80px] max-h-[180px] overflow-y-auto",
                searching && "opacity-70"
              )}
            >
              {searching ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : searchQuery.trim() ? (
                searchResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">
                    No customers found. Try a different search or create a new customer.
                  </p>
                ) : (
                  <ul className="p-1">
                    {searchResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectCustomer(c)}
                          className={cn(
                            "w-full text-left text-sm px-3 py-2 rounded-md hover:bg-accent transition-colors",
                            selectedCustomer?.id === c.id && "bg-accent"
                          )}
                        >
                          {formatCustomerLine(c)}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="text-sm text-muted-foreground p-4 text-center">
                  Type to search customers.
                </p>
              )}
            </div>
          </div>

          {/* — or — */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
              <span className="bg-background px-2">or</span>
            </div>
          </div>

          {/* Create New */}
          <div>
            {!createNew ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleCreateNew}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Create New Customer
              </Button>
            ) : (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">New customer</p>
                <div className="grid gap-2">
                  <div>
                    <Label htmlFor="assign-new-name">Name</Label>
                    <Input
                      id="assign-new-name"
                      placeholder="Customer name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="assign-new-phone">Phone</Label>
                    <PhoneInput
                      id="assign-new-phone"
                      value={newPhone}
                      onChange={setNewPhone}
                      placeholder="Customer phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="assign-new-email">Email</Label>
                    <Input
                      id="assign-new-email"
                      type="email"
                      placeholder="email@example.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleAssign}
            disabled={!hasSelection || submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Assign Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
