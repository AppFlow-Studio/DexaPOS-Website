import type { ReceiptTemplateFormData } from "../../types";
import { ReceiptPaper, DottedLine, DoubleLine } from "./ReceiptPaper";

interface EndOfDayReportPreviewProps {
  formState: ReceiptTemplateFormData;
}

export function EndOfDayReportPreview({
  formState,
}: EndOfDayReportPreviewProps) {
  return (
    <ReceiptPaper>
      {formState.show_logo && (
        <div className="text-center mb-2">
          <div className="inline-block w-10 h-10 bg-zinc-300 dark:bg-zinc-700 rounded" />
        </div>
      )}

      <div className="text-center font-bold text-sm">Sample Restaurant</div>
      <div className="text-center font-bold text-lg mt-1">
        END OF DAY REPORT
      </div>
      <div className="text-center text-[10px] text-zinc-500">
        Z-Report #247
      </div>
      {formState.header_text && (
        <div className="text-center text-[10px] mt-1 whitespace-pre-wrap">
          {formState.header_text}
        </div>
      )}

      <DoubleLine />

      <div className="text-[10px] text-zinc-500">
        <div className="flex justify-between">
          <span>Report Date:</span>
          <span>01/15/2026</span>
        </div>
        <div className="flex justify-between">
          <span>Open Time:</span>
          <span>10:00 AM</span>
        </div>
        <div className="flex justify-between">
          <span>Close Time:</span>
          <span>10:30 PM</span>
        </div>
      </div>

      <DottedLine />

      {/* Sales Summary */}
      <div className="font-bold text-xs uppercase mb-1">Sales Summary</div>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Total Orders</span>
          <span>87</span>
        </div>
        <div className="flex justify-between">
          <span>Gross Sales</span>
          <span>$3,245.80</span>
        </div>
        <div className="flex justify-between text-zinc-500">
          <span>Discounts</span>
          <span>-$125.00</span>
        </div>
        <div className="flex justify-between text-zinc-500">
          <span>Refunds</span>
          <span>-$45.50</span>
        </div>
        <div className="flex justify-between text-zinc-500">
          <span>Voids</span>
          <span>-$22.00</span>
        </div>
      </div>

      <DottedLine />

      <div className="flex justify-between font-bold text-sm">
        <span>Net Sales</span>
        <span>$3,053.30</span>
      </div>

      {formState.show_tax_breakdown && (
        <>
          <DottedLine />
          <div className="font-bold text-xs uppercase mb-1">Tax Summary</div>
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>State Tax (6%)</span>
              <span>$183.20</span>
            </div>
            <div className="flex justify-between">
              <span>Local Tax (2.25%)</span>
              <span>$68.70</span>
            </div>
          </div>
          <div className="flex justify-between font-semibold mt-1">
            <span>Total Tax</span>
            <span>$251.90</span>
          </div>
        </>
      )}

      <DottedLine />

      {/* Payment Breakdown */}
      <div className="font-bold text-xs uppercase mb-1">
        Payment Breakdown
      </div>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Cash</span>
          <span>$845.20</span>
        </div>
        <div className="flex justify-between">
          <span>Credit Card</span>
          <span>$1,924.50</span>
        </div>
        <div className="flex justify-between">
          <span>Debit Card</span>
          <span>$283.60</span>
        </div>
        <div className="flex justify-between">
          <span>Gift Card</span>
          <span>$45.50</span>
        </div>
      </div>

      <DoubleLine />

      <div className="flex justify-between font-bold text-sm">
        <span>Grand Total</span>
        <span>$3,305.20</span>
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
