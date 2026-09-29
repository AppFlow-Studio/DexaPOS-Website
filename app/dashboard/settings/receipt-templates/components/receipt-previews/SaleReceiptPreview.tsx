"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  printsSignatureBlock,
  resolveSignatureDisclaimer,
  type ReceiptCopy,
  type ReceiptTender,
} from "@/lib/receipts/signature-block";
import type { ReceiptTemplateFormData, LocationIdentity } from "../../types";
import { ReceiptPaper, ReceiptIdentityBlock, DoubleLine } from "./ReceiptPaper";

interface SaleReceiptPreviewProps {
  formState: ReceiptTemplateFormData;
  locationIdentity?: LocationIdentity;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-full bg-muted/70 p-0.5"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-between gap-2", className)}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const Gap = () => <div className="h-3" />;

// Follows the order the POS prints a sale receipt in: header, items, totals,
// payments, signature block, order details, footer, copy label.
export function SaleReceiptPreview({ formState, locationIdentity }: SaleReceiptPreviewProps) {
  const [copy, setCopy] = useState<ReceiptCopy>("merchant");
  const [tender, setTender] = useState<ReceiptTender>("card");

  const isCard = tender === "card";
  const showSignatureBlock = printsSignatureBlock({
    printSignatureLine: formState.print_signature_line,
    copy,
    tender,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Copy"
          value={copy}
          onChange={setCopy}
          options={[
            { value: "merchant", label: "Merchant copy" },
            { value: "customer", label: "Customer copy" },
          ]}
        />
        <Segmented
          label="Tender"
          value={tender}
          onChange={setTender}
          options={[
            { value: "card", label: "Card" },
            { value: "cash", label: "Cash" },
          ]}
        />
      </div>

      <ReceiptPaper>
        {/* Header */}
        <ReceiptIdentityBlock locationIdentity={locationIdentity} />
        {formState.header_text && (
          <div className="text-center text-[10px] mt-1 whitespace-pre-wrap">
            {formState.header_text}
          </div>
        )}

        <Gap />

        {/* Order number */}
        <div className="text-center font-bold text-sm">#1042</div>
        {formState.show_order_type && (
          <div className="text-center">Dine In - Table 5</div>
        )}

        <DoubleLine />

        {/* Items */}
        <div className="space-y-1">
          <Row label="1x Cheeseburger" value="$12.99" className="font-bold" />
          {formState.show_item_modifiers && (
            <div className="pl-3 text-[10px]">+ Extra Cheese, No Onions</div>
          )}

          <Row label="1x Caesar Salad" value="$9.50" className="font-bold" />
          {formState.show_item_modifiers && (
            <div className="pl-3 text-[10px]">+ Grilled Chicken</div>
          )}

          <Row label="2x Iced Tea" value="$5.98" className="font-bold" />
        </div>

        <DoubleLine />

        {/* Totals */}
        <Row label="Subtotal" value="$28.47" className="text-zinc-500" />
        <Row label="Tax" value="$2.35" className="text-zinc-500" />
        {isCard && <Row label="Tip" value="$5.00" className="text-zinc-500" />}
        <Row
          label="Total"
          value={isCard ? "$35.82" : "$30.82"}
          className="font-bold text-sm"
        />

        {/* Tip write-in lines */}
        {formState.show_tip_line && (
          <>
            <Gap />
            <Row label="Tip:" value="________" />
            <Row label="Total w/ Tip:" value="________" className="font-bold" />
          </>
        )}

        <Gap />

        {/* Payments */}
        {isCard ? (
          <>
            <Row label="Paid: Card" value="$30.82" className="font-bold" />
            <div className="pl-3">
              <Row label="Tip" value="$5.00" />
              <div>VISA *4242</div>
              <div>Auth: 004217</div>
              <div>AID: A0000000031010</div>
            </div>
          </>
        ) : (
          <>
            <Row label="Paid: Cash" value="$30.82" className="font-bold" />
            <div className="pl-3">
              <Row label="Tendered" value="$40.00" />
              <Row label="Change" value="$9.18" />
            </div>
          </>
        )}

        {/* Cardholder signature block */}
        {showSignatureBlock && (
          <div className="mt-10">
            <div className="flex items-end gap-1">
              <span>X</span>
              <span className="mb-1 flex-1 border-b border-dashed border-zinc-500" />
            </div>
            <div className="text-center">Cardholder Signature</div>
            <div className="mt-3 text-center text-[10px] whitespace-pre-wrap">
              {resolveSignatureDisclaimer(formState.signature_line_disclaimer)}
            </div>
          </div>
        )}

        <Gap />

        {/* Order details */}
        <div className="text-zinc-500">
          <Row label="Order Date" value="01/15/26 7:14 PM" />
          {formState.show_server_name && <Row label="Assignee" value="Sarah M." />}
          {formState.show_order_type && <Row label="Type" value="Dine In" />}
          <Row label="Table" value="5" />
          <Row label="Print Date" value="01/15/26, 7:21 PM" />
        </div>

        <div className="h-8" />

        {/* Footer */}
        {formState.footer_text && (
          <div className="mb-3 text-center text-[10px] whitespace-pre-wrap">
            {formState.footer_text}
          </div>
        )}

        {/* Copy label */}
        <div className="text-center font-bold">
          {copy === "merchant" ? "Merchant Copy" : "Customer Copy"}
        </div>
        <div className="mt-3 text-center font-bold text-zinc-500">
          Created with Dexa
        </div>
      </ReceiptPaper>
    </div>
  );
}
