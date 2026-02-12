import type { ReceiptTemplateFormData } from "../../types";
import { ReceiptPaper, DottedLine, DoubleLine } from "./ReceiptPaper";

interface RefundReceiptPreviewProps {
  formState: ReceiptTemplateFormData;
}

export function RefundReceiptPreview({ formState }: RefundReceiptPreviewProps) {
  return (
    <ReceiptPaper>
      {formState.show_logo && (
        <div className="text-center mb-2">
          <div className="inline-block w-10 h-10 bg-zinc-300 dark:bg-zinc-700 rounded" />
        </div>
      )}

      {/* REFUND Banner */}
      <div className="text-center font-bold text-xl border-2 border-amber-500 text-amber-600 dark:text-amber-400 py-1 mb-2">
        REFUND
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

      {/* Refunded items */}
      <div className="font-semibold text-[10px] uppercase mb-1">
        Refunded Items:
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>1x Cheeseburger</span>
          <span>-$12.99</span>
        </div>
        {formState.show_item_modifiers && (
          <div className="text-zinc-500 pl-3 text-[10px]">
            + Extra Cheese
          </div>
        )}
      </div>

      <DottedLine />

      {formState.show_tax_breakdown && (
        <>
          <div className="flex justify-between text-zinc-500">
            <span>Subtotal</span>
            <span>-$12.99</span>
          </div>
          <div className="flex justify-between text-zinc-500">
            <span>Tax Refund</span>
            <span>-$1.07</span>
          </div>
        </>
      )}

      <DoubleLine />
      <div className="flex justify-between font-bold text-sm text-amber-600 dark:text-amber-400">
        <span>Refund Total</span>
        <span>-$14.06</span>
      </div>

      <DottedLine />

      <div className="text-[10px]">
        <div className="flex justify-between">
          <span>Refunded to:</span>
          <span>Visa ending 4242</span>
        </div>
        <div className="text-zinc-500 mt-1">
          Processed by: Manager (John D.)
        </div>
        <div className="text-zinc-500">01/15/2026 1:15 PM</div>
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
