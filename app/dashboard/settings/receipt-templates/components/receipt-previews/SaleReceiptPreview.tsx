import type { ReceiptTemplateFormData } from "../../types";
import { ReceiptPaper, DottedLine, DoubleLine } from "./ReceiptPaper";
import { Barcode, QrCode } from "lucide-react";

interface SaleReceiptPreviewProps {
  formState: ReceiptTemplateFormData;
}

export function SaleReceiptPreview({ formState }: SaleReceiptPreviewProps) {
  return (
    <ReceiptPaper>
      {/* Logo */}
      {formState.show_logo && (
        <div className="text-center mb-2">
          <div className="inline-block w-10 h-10 bg-zinc-300 dark:bg-zinc-700 rounded" />
        </div>
      )}

      {/* Header */}
      <div className="text-center font-bold text-sm">Sample Restaurant</div>
      <div className="text-center text-[10px] text-zinc-500">
        123 Main St, City, ST 12345
      </div>
      <div className="text-center text-[10px] text-zinc-500">
        (555) 123-4567
      </div>
      {formState.header_text && (
        <div className="text-center text-[10px] mt-1 whitespace-pre-wrap">
          {formState.header_text}
        </div>
      )}

      <DoubleLine />

      {/* Order info */}
      <div className="flex justify-between">
        <span>Order #1042</span>
        <span>01/15/2026</span>
      </div>
      {formState.show_order_type && (
        <div className="text-zinc-500">Dine In - Table 5</div>
      )}
      {formState.show_server_name && (
        <div className="text-zinc-500">Server: Sarah M.</div>
      )}

      <DottedLine />

      {/* Items */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>1x Cheeseburger</span>
          <span>$12.99</span>
        </div>
        {formState.show_item_modifiers && (
          <div className="text-zinc-500 pl-3 text-[10px]">
            + Extra Cheese, No Onions
          </div>
        )}

        <div className="flex justify-between">
          <span>1x Caesar Salad</span>
          <span>$9.50</span>
        </div>
        {formState.show_item_modifiers && (
          <div className="text-zinc-500 pl-3 text-[10px]">
            + Grilled Chicken
          </div>
        )}

        <div className="flex justify-between">
          <span>2x Iced Tea</span>
          <span>$5.98</span>
        </div>
      </div>

      <DottedLine />

      {/* Totals */}
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>$28.47</span>
      </div>
      {formState.show_tax_breakdown && (
        <>
          <div className="flex justify-between text-zinc-500">
            <span>Tax (8.25%)</span>
            <span>$2.35</span>
          </div>
        </>
      )}
      <DoubleLine />
      <div className="flex justify-between font-bold text-sm">
        <span>Total</span>
        <span>$30.82</span>
      </div>

      {/* Tip line */}
      {formState.show_tip_line && (
        <>
          <DottedLine />
          <div className="flex justify-between">
            <span>Tip:</span>
            <span>________</span>
          </div>
          <div className="flex justify-between font-bold mt-1">
            <span>Total w/ Tip:</span>
            <span>________</span>
          </div>
        </>
      )}

      <DottedLine />

      {/* Payment */}
      <div className="flex justify-between">
        <span>Paid: Card</span>
        <span>$30.82</span>
      </div>
      <div className="text-zinc-500 text-[10px]">
        Visa ending in 4242
      </div>

      {/* Footer */}
      {formState.footer_text && (
        <>
          <DottedLine />
          <div className="text-center text-[10px] whitespace-pre-wrap">
            {formState.footer_text}
          </div>
        </>
      )}

      {/* Loyalty Section */}
      {formState.show_loyalty_rewards && (
        <>
          <DottedLine />
          <div className="text-center font-bold text-xs mb-1">REWARDS SUMMARY</div>
          <DottedLine />

          {/* Mock loyalty programs */}
          <div className="text-[10px] space-y-1">
            <div>☕ Coffee Card: +1 punch (8/9)</div>
            <div className="text-zinc-500 pl-2 text-[9px]">1 more to free coffee!</div>

            <div className="mt-2">⭐ VIP Points: +18 pts (358)</div>
            <div className="text-zinc-500 pl-2 text-[9px]">142 pts to next reward</div>
          </div>

          <DottedLine />
          <div className="text-center text-[10px] text-zinc-600">
            🎁 You have 1 reward available!
          </div>
          <div className="text-center text-[9px] text-zinc-500 mt-1">
            Show your phone at checkout to redeem.
          </div>

          <DottedLine />
          <div className="text-center text-[9px] text-zinc-600">
            Earn rewards → ask your server!
          </div>
        </>
      )}

      {/* Barcode / QR */}
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
