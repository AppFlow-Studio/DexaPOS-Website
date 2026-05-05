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
import { PhoneDigitsInput } from "@/components/ui/phone-digits-input";
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

function isValidPhone(digits: string): boolean {
  return digits.replace(/\D/g, "").length === 10;
}

/** Strip non-digits and drop a leading "1" so we can preset 10 US digits. */
function extractTenDigits(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.slice(-10);
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
      setRecipient(extractTenDigits(customerPhone));
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
      const recipientFormatted =
        method === "sms"
          ? `+1${recipient.replace(/\D/g, "")}`
          : recipient.trim();
      const params: SendReceiptParams = {
        orderId: order.id,
        deliveryMethod: method,
        recipient: recipientFormatted,
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
                  setRecipient(
                    customerPhone ? extractTenDigits(customerPhone) : ""
                  );
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
            {method === "email" ? (
              <Input
                id="recipient"
                type="email"
                placeholder="john@example.com"
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
            ) : (
              <>
                <PhoneDigitsInput
                  value={recipient.replace(/\D/g, "")}
                  onChange={setRecipient}
                />
                <p className="text-xs text-muted-foreground">
                  US numbers only · we&apos;ll add the +1 for you
                </p>
              </>
            )}
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
