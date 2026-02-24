"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useCreateCustomer,
  useCheckCustomerByPhone,
} from "../hooks/useCustomers";

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (customerId: string) => void;
}

export function AddCustomerDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddCustomerDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [phoneCheckError, setPhoneCheckError] = useState<string | null>(null);
  const [phoneCheckLoading, setPhoneCheckLoading] = useState(false);

  const createMutation = useCreateCustomer();
  const checkPhoneMutation = useCheckCustomerByPhone();

  const isLoading = createMutation.isPending;
  const formValid = name.trim() && phone.trim();

  const handlePhoneBlur = async () => {
    if (!phone.trim()) return;

    setPhoneCheckLoading(true);
    try {
      const existingCustomer = await checkPhoneMutation.mutateAsync(
        phone.trim()
      );
      if (existingCustomer) {
        setPhoneCheckError(
          `A customer with phone ${phone} already exists: ${existingCustomer.name || "Unknown"}`
        );
      } else {
        setPhoneCheckError(null);
      }
    } catch (error) {
      console.error("Error checking phone:", error);
    } finally {
      setPhoneCheckLoading(false);
    }
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim().toUpperCase();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleSubmit = async () => {
    if (!formValid) return;

    try {
      const result = await createMutation.mutateAsync({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes.trim() || undefined,
      });

      if (result.success && result.customerId) {
        // Reset form
        setName("");
        setPhone("");
        setEmail("");
        setAddress("");
        setTags([]);
        setTagInput("");
        setNotes("");
        setPhoneCheckError(null);

        onOpenChange(false);
        onSuccess?.(result.customerId);
      }
    } catch (error) {
      console.error("Error creating customer:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Customer</DialogTitle>
          <DialogDescription>
            Create a new customer record in your database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Customer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Phone */}
          <div>
            <Label htmlFor="phone">
              Phone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              placeholder="Phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={handlePhoneBlur}
              disabled={isLoading}
            />
            {phoneCheckLoading && (
              <p className="text-xs text-muted-foreground mt-1">
                Checking for existing customer...
              </p>
            )}
            {phoneCheckError && (
              <Alert variant="destructive" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{phoneCheckError}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Email */}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Address */}
          <div>
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="Customer address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Tags */}
          <div>
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2 mb-2">
              <Input
                id="tags"
                placeholder="Add a tag (e.g., VIP)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                disabled={isLoading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                disabled={!tagInput.trim() || isLoading}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:opacity-70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formValid || isLoading || phoneCheckLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? "Creating..." : "Create Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}