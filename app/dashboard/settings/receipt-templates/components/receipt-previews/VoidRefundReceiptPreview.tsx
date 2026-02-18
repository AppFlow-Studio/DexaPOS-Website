import type { ReceiptTemplateFormData } from "../../types";
import { ReceiptPaper, DottedLine, DoubleLine } from "./ReceiptPaper";

interface VoidRefundReceiptPreviewProps {
  formState: ReceiptTemplateFormData;
}

export function VoidRefundReceiptPreview({ formState }: VoidRefundReceiptPreviewProps) {
  return (
    <ReceiptPaper>
      {formState.show_logo && (
        <div className="text-center mb-2">
          <div className="inline-block w-10 h-10 bg-zinc-300 dark:bg-zinc-700 rounded" />
        </div>
      )}

      {/* VOID / REFUND Banner */}
      <div className="text-center font-bold text-xl border-2 border-red-500 text-red-600 dark:text-red-400 py-1 mb-2">
        VOID / REFUND
      </div>

      <div className="text-center font-bold text-sm">Sample Restaurant</div>
      {formState.header_text && (
        <div className="text-center text-[10px] mt-1 whitespace-pre-wrap">
          {formState.header_text}
        </div>
      )}

      <DoubleLine />

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

      {/* Affected items */}
      <div className="font-semibold text-[10px] uppercase mb-1">
        Affected Items:
      </div>
      <div className="space-y-1">
        <div className="flex justify-between line-through opacity-60">
          <span>1x Cheeseburger</span>
          <span>$12.99</span>
        </div>
        {formState.show_item_modifiers && (
          <div className="text-zinc-500 pl-3 text-[10px] line-through opacity-60">
            + Extra Cheese
          </div>
        )}
        <div className="flex justify-between line-through opacity-60">
          <span>1x Caesar Salad</span>
          <span>$9.50</span>
        </div>
      </div>

      <DottedLine />

      {formState.show_tax_breakdown && (
        <>
          <div className="flex justify-between text-zinc-500">
            <span>Subtotal</span>
            <span>-$22.49</span>
          </div>
          <div className="flex justify-between text-zinc-500">
            <span>Tax (8.25%)</span>
            <span>-$1.86</span>
          </div>
        </>
      )}

      <DoubleLine />
      <div className="flex justify-between font-bold text-sm text-red-600 dark:text-red-400">
        <span>Total</span>
        <span>-$24.35</span>
      </div>

      <DottedLine />

      <div className="text-[10px]">
        <div className="font-semibold">Reason:</div>
        <div className="text-zinc-500">Customer changed mind</div>
        <div className="flex justify-between mt-1">
          <span className="text-zinc-500">Refunded to:</span>
          <span className="text-zinc-500">Visa ending 4242</span>
        </div>
        <div className="text-zinc-500 mt-1">
          Processed by: Manager (John D.)
        </div>
        <div className="text-zinc-500">01/15/2026 12:45 PM</div>
      </div>

      {formState.footer_text && (
        <>
          <DottedLine />
          <div className="text-center text-[10px] whitespace-pre-wrap">
            {formState.footer_text}
          </div>
        </>
      )}
    </ReceiptPaper>
  );
}
