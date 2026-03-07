"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, MessageSquare, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  sendReceipt,
  getReceiptPreviewHtml,
  type SendReceiptParams,
} from "@/app/actions/orders/send-receipt";
import type { OrderResponse } from "@/types/order-management";

// ─── Validation ───

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10;
}

// ─── Props ───

export interface SendReceiptModalProps {
  order: OrderResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const RECEIPT_TYPE_OPTIONS = [
  { value: "sale", label: "Customer Receipt" },
] as const;

// ─── Component ───

export function SendReceiptModal({
  order,
  open,
  onOpenChange,
  onSuccess,
}: SendReceiptModalProps) {
  const [method, setMethod] = React.useState<"email" | "sms">("email");
  const [recipient, setRecipient] = React.useState("");
  const [receiptType, setReceiptType] = React.useState<string>("sale");
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  const customerEmail = order?.customer_email ?? null;
  const customerPhone = order?.customer_phone ?? null;

  React.useEffect(() => {
    if (!open) return;
    if (customerEmail) {
      setMethod("email");
      setRecipient(customerEmail);
    } else if (customerPhone) {
      setMethod("sms");
      setRecipient(customerPhone);
    } else {
      setMethod("email");
      setRecipient("");
    }
    setPreviewHtml(null);
  }, [open, customerEmail, customerPhone]);

  const isValid =
    method === "email"
      ? isValidEmail(recipient)
      : isValidPhone(recipient);

  const handlePreview = async () => {
    setIsPreviewLoading(true);
    setPreviewHtml(null);
    try {
      const res = await getReceiptPreviewHtml(order.id);
      if (res.success && res.html) {
        setPreviewHtml(res.html);
      } else {
        toast.error(res.message || "Failed to load preview");
      }
    } catch {
      toast.error("Failed to load preview");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    if (!isValid) return;
    setIsSending(true);
    try {
      const params: SendReceiptParams = {
        orderId: order.id,
        deliveryMethod: method,
        recipient: recipient.trim(),
        receiptTemplateId: undefined,
      };
      const result = await sendReceipt(params);
      if (result.success) {
        toast.success(result.message);
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error("Failed to send receipt");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" elevation="high">
        <DialogHeader>
          <DialogTitle>Send Receipt</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Send via</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={method === "email" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => {
                  setMethod("email");
                  if (customerEmail) setRecipient(customerEmail);
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
              <Button
                type="button"
                variant={method === "sms" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => {
                  setMethod("sms");
                  if (customerPhone) setRecipient(customerPhone);
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                SMS
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient">
              {method === "email" ? "Email" : "Phone"}
            </Label>
            <Input
              id="recipient"
              type={method === "email" ? "email" : "tel"}
              placeholder={
                method === "email"
                  ? "john@example.com"
                  : "+1 555 123 4567"
              }
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className={cn(
                !recipient
                  ? ""
                  : isValid
                    ? "border-green-500/50"
                    : "border-amber-500/50"
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Receipt type</Label>
            <Select value={receiptType} onValueChange={setReceiptType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECEIPT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {previewHtml && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="border rounded-lg overflow-hidden bg-white max-h-[280px] overflow-y-auto">
                <iframe
                  srcDoc={previewHtml}
                  title="Receipt preview"
                  className="w-full min-h-[240px] border-0"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={isPreviewLoading}
            >
              {isPreviewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Eye className="h-4 w-4 mr-2" />
              )}
              Preview
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!isValid || isSending}
            >
              {isSending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Send Receipt
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
