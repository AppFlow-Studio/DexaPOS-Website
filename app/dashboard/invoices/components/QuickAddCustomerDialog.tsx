"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useClerkOrgId } from "@/app/dashboard/hooks/useLocationScoped";
import type { CustomerListItem } from "@/types/customer";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizePhone } from "@/lib/phone";

interface QuickAddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: CustomerListItem) => void;
}

export function QuickAddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: QuickAddCustomerDialogProps) {
  const clerkOrgId = useClerkOrgId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setPhone("");
  };

  const handleCreate = async () => {
    if (!name.trim() && !email.trim() && !phone.trim()) {
      toast.error("Please enter at least a name, email, or phone");
      return;
    }
    if (!clerkOrgId) return;

    setLoading(true);
    try {
      const { CreateCustomerQuick } = await import(
        "@/app/dashboard/actions/invoices-customer-helper"
      );
      const result = await CreateCustomerQuick(clerkOrgId, {
        name: name.trim() || null,
        email: email.trim() || null,
        phone: normalizePhone(phone) ?? phone.trim() || null,
      });

      if (result.error) {
        toast.error("Failed to create customer", {
          description: result.error,
        });
        return;
      }

      if (result.data) {
        toast.success("Customer added");
        onCreated(result.data as CustomerListItem);
        reset();
        onOpenChange(false);
      }
    } catch {
      toast.error("Failed to create customer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-cust-name">Name</Label>
            <Input
              id="new-cust-name"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-cust-email">Email</Label>
            <Input
              id="new-cust-email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-cust-phone">Phone</Label>
            <PhoneInput
              id="new-cust-phone"
              value={phone}
              onChange={setPhone}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            At least one field is required.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
