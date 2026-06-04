import type { ReceiptTemplateFormData, LocationIdentity } from "../../types";
import { ReceiptPaper, ReceiptIdentityBlock, DottedLine, DoubleLine } from "./ReceiptPaper";
import { Barcode, QrCode, Clock } from "lucide-react";

interface OnlineOrderTicketPreviewProps {
  formState: ReceiptTemplateFormData;
  locationIdentity?: LocationIdentity;
}

export function OnlineOrderTicketPreview({
  formState,
  locationIdentity,
}: OnlineOrderTicketPreviewProps) {
  return (
    <ReceiptPaper>
      {formState.show_logo && (
        <div className="text-center mb-2">
          <div className="inline-block w-10 h-10 bg-zinc-300 dark:bg-zinc-700 rounded" />
        </div>
      )}

      <ReceiptIdentityBlock locationIdentity={locationIdentity} />

      {/* Online platform badge */}
      <div className="text-center mt-1">
        <span className="inline-block bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-semibold px-2 py-0.5 rounded-full">
          ONLINE ORDER
        </span>
      </div>

      {formState.header_text && (
        <div className="text-center text-[10px] mt-1 whitespace-pre-wrap">
          {formState.header_text}
        </div>
      )}

      <DoubleLine />

      <div className="flex justify-between">
        <span>Order #W-2048</span>
        <span>01/15/2026</span>
      </div>
      {formState.show_order_type && (
        <div className="font-semibold">Pickup</div>
      )}
      <div className="text-zinc-500 text-[10px]">
        Customer: Alex Johnson
      </div>
      <div className="text-zinc-500 text-[10px]">
        Phone: (555) 987-6543
      </div>

      {formState.show_ready_by_time && (
        <div className="flex items-center justify-center gap-1 mt-1 font-bold text-sm bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 py-1 rounded">
          <Clock className="h-3 w-3" />
          <span>Ready by: 1:00 PM</span>
        </div>
      )}

      <DottedLine />

      {/* Items */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>2x Chicken Wrap</span>
          <span>$21.98</span>
        </div>
        {formState.show_item_modifiers && (
          <div className="text-zinc-500 pl-3 text-[10px]">
            + Extra Avocado, Spicy Sauce
          </div>
        )}

        <div className="flex justify-between">
          <span>1x Fries (Large)</span>
          <span>$4.99</span>
        </div>

        <div className="flex justify-between">
          <span>1x Chocolate Shake</span>
          <span>$6.50</span>
        </div>
      </div>

      <DottedLine />

      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>$33.47</span>
      </div>
      {formState.show_tax_breakdown && (
        <div className="flex justify-between text-zinc-500">
          <span>Tax (8.25%)</span>
          <span>$2.76</span>
        </div>
      )}

      <DoubleLine />
      <div className="flex justify-between font-bold text-sm">
        <span>Total</span>
        <span>$36.23</span>
      </div>

      <DottedLine />

      <div className="text-[10px] text-zinc-500">
        Paid Online - Card ending 8821
      </div>

      {formState.footer_text && (
        <>
          <DottedLine />
          <div className="text-center text-[10px] whitespace-pre-wrap">
            {formState.footer_text}
          </div>
        </>
      )}

      {(formState.show_barcode || formState.show_qr_code) && (
        <div className="flex justify-center gap-3 mt-3">
          {formState.show_barcode && (
            <Barcode className="h-8 w-20 text-zinc-400" />
          )}
          {formState.show_qr_code && (
            <QrCode className="h-8 w-8 text-zinc-400" />
          )}
        </div>
      )}
    </ReceiptPaper>
  );
}
