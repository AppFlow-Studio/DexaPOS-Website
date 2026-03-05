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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateCustomer,
  useCheckCustomerByPhone,
} from "../hooks/useCustomers";

const SUGGESTED_TAGS = [
  "VIP",
  "REGULAR",
  "NEW",
  "CORPORATE",
  "FRIEND_OF_OWNER",
  "INFLUENCER",
  "COMPLAINT_HISTORY",
  "CATERING_CLIENT",
];

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-bold">Add Customer</DialogTitle>
          <DialogDescription className="text-base">
            Create a new customer record in your system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Name */}
          <div className="space-y-2.5">
            <Label htmlFor="name" className="text-sm font-semibold">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="Enter customer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              className="h-10 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Phone */}
          <div className="space-y-2.5">
            <Label htmlFor="phone" className="text-sm font-semibold">
              Phone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              placeholder="Enter phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={handlePhoneBlur}
              disabled={isLoading}
              className="h-10 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary"
            />
            {phoneCheckLoading && (
              <p className="text-xs text-muted-foreground animate-pulse">
                Checking for existing customer...
              </p>
            )}
            {phoneCheckError && (
              <Alert variant="destructive" className="mt-2 border-destructive/50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{phoneCheckError}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Email */}
          <div className="space-y-2.5">
            <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="h-10 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Address */}
          <div className="space-y-2.5">
            <Label htmlFor="address" className="text-sm font-semibold">Address</Label>
            <Input
              id="address"
              placeholder="Enter customer address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isLoading}
              className="h-10 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Tags */}
          <div className="space-y-3 pt-2">
            <Label className="text-sm font-semibold">Tags</Label>

            {/* Suggested Tags Dropdown */}
            <Select onValueChange={(value) => {
              if (value) {
                handleRemoveTag(value);
                setTags([...tags, value]);
              }
            }}>
              <SelectTrigger className="w-full h-10 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary">
                <SelectValue placeholder="Select suggested tags..." />
              </SelectTrigger>
              <SelectContent>
                {SUGGESTED_TAGS.filter((tag) => !tags.includes(tag)).map(
                  (tag) => (
                    <SelectItem key={tag} value={tag} className="font-medium">
                      {tag}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>

            {/* Current Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-muted/40 rounded-lg border border-muted/60">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1.5 px-3 py-1.5 font-medium">
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:opacity-70 transition-opacity ml-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Custom Tag Input */}
            <div className="space-y-2.5">
              <Label htmlFor="custom-tag" className="text-xs font-medium text-muted-foreground">
                Create Custom Tag (Optional)
              </Label>
              <div className="flex gap-2.5">
                <Input
                  id="custom-tag"
                  placeholder="e.g., Premium Member"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  disabled={isLoading}
                  className="h-10 flex-1 bg-background border-input focus-visible:ring-2 focus-visible:ring-primary"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddTag}
                  disabled={!tagInput.trim() || isLoading}
                  className="h-10"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2.5">
            <Label htmlFor="notes" className="text-sm font-semibold">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional notes about this customer..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLoading}
              rows={3}
              className="bg-background border-input focus-visible:ring-2 focus-visible:ring-primary resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="h-10"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!formValid || isLoading || phoneCheckLoading}
            className="h-10 gap-2"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isLoading ? "Creating..." : "Create Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}