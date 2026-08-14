"use client";

import { useEffect, useState } from "react";
import { Mail, MessageSquare, Send } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useSendInvoice } from "../hooks/useInvoices";
import type { Invoice } from "@/app/dashboard/actions/invoices";

interface SendInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Pick<Invoice, "id" | "invoice_number" | "customer">;
  /** Called after at least one channel dispatched successfully. */
  onSent?: () => void;
}

export function SendInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onSent,
}: SendInvoiceDialogProps) {
  const sendInvoice = useSendInvoice();

  const [emailOn, setEmailOn] = useState(true);
  const [smsOn, setSmsOn] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saveToProfile, setSaveToProfile] = useState(false);

  // Re-prime from the linked customer whenever the dialog opens.
  useEffect(() => {
    if (open) {
      const custEmail = invoice.customer?.email ?? "";
      const custPhone = invoice.customer?.phone ?? "";
      setEmail(custEmail);
      setPhone(custPhone);
      setEmailOn(!!custEmail || !custPhone);
      setSmsOn(!custEmail && !!custPhone);
      setSaveToProfile(false);
    }
  }, [open, invoice.customer]);

  const channels: ("email" | "sms")[] = [
    ...(emailOn ? (["email"] as const) : []),
    ...(smsOn ? (["sms"] as const) : []),
  ];

  const canSend =
    channels.length > 0 &&
    (!emailOn || email.trim().length > 0) &&
    (!smsOn || phone.trim().length > 0) &&
    !sendInvoice.isPending;

  const handleSend = () => {
    sendInvoice.mutate(
      {
        invoiceId: invoice.id,
        channels,
        email: emailOn ? email.trim() || undefined : undefined,
        phone: smsOn ? phone.trim() || undefined : undefined,
        saveToProfile,
      },
      {
        onSuccess: (result) => {
          if (result.success) {
            onOpenChange(false);
            onSent?.();
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send {invoice.invoice_number}</DialogTitle>
          <DialogDescription>
            Choose how to deliver this invoice. A secure pay link is included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Email channel */}
          <div className="rounded-2xl border p-3 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                checked={emailOn}
                onCheckedChange={(v) => setEmailOn(!!v)}
              />
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Email</span>
            </label>
            {emailOn && (
              <div className="space-y-1.5 pl-1">
                <Label className="text-xs text-muted-foreground">
                  Recipient email
                </Label>
                <Input
                  type="email"
                  placeholder="customer@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 text-sm"
                />
                {!invoice.customer?.email && (
                  <p className="text-xs text-muted-foreground">
                    No email on file — enter one to send.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* SMS channel */}
          <div className="rounded-2xl border p-3 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox checked={smsOn} onCheckedChange={(v) => setSmsOn(!!v)} />
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">SMS</span>
            </label>
            {smsOn && (
              <div className="space-y-1.5 pl-1">
                <Label className="text-xs text-muted-foreground">
                  Recipient phone
                </Label>
                <Input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-9 text-sm"
                />
                {!invoice.customer?.phone && (
                  <p className="text-xs text-muted-foreground">
                    No phone on file — enter one to send.
                  </p>
                )}
              </div>
            )}
          </div>

          {invoice.customer?.id && (
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                checked={saveToProfile}
                onCheckedChange={(v) => setSaveToProfile(!!v)}
              />
              <span className="text-sm text-muted-foreground">
                Save edited contact to customer profile
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            <Send className={cn("h-4 w-4 mr-2", sendInvoice.isPending && "animate-pulse")} />
            {sendInvoice.isPending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
