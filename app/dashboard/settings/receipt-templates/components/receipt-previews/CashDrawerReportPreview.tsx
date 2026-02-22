import type { ReceiptTemplateFormData } from "../../types";
import { ReceiptPaper, DottedLine, DoubleLine } from "./ReceiptPaper";

interface CashDrawerReportPreviewProps {
  formState: ReceiptTemplateFormData;
}

export function CashDrawerReportPreview({
  formState,
}: CashDrawerReportPreviewProps) {
  return (
    <ReceiptPaper>
      {formState.show_logo && (
        <div className="text-center mb-2">
          <div className="inline-block w-10 h-10 bg-zinc-300 dark:bg-zinc-700 rounded" />
        </div>
      )}

      <div className="text-center font-bold text-sm">Sample Restaurant</div>
      <div className="text-center font-bold text-lg mt-1">
        CASH DRAWER REPORT
      </div>
      {formState.header_text && (
        <div className="text-center text-[10px] mt-1 whitespace-pre-wrap">
          {formState.header_text}
        </div>
      )}

      <DoubleLine />

      <div className="text-[10px] text-zinc-500">
        <div className="flex justify-between">
          <span>Station:</span>
          <span>Register 1</span>
        </div>
        <div className="flex justify-between">
          <span>Opened by:</span>
          <span>Sarah M.</span>
        </div>
        <div className="flex justify-between">
          <span>Opened at:</span>
          <span>10:00 AM</span>
        </div>
        <div className="flex justify-between">
          <span>Closed by:</span>
          <span>Sarah M.</span>
        </div>
        <div className="flex justify-between">
          <span>Closed at:</span>
          <span>6:00 PM</span>
        </div>
      </div>

      <DottedLine />

      {/* Opening count */}
      <div className="font-bold text-xs uppercase mb-1">Opening Count</div>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Starting Cash</span>
          <span>$200.00</span>
        </div>
      </div>

      <DottedLine />

      {/* Activity */}
      <div className="font-bold text-xs uppercase mb-1">Activity</div>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Cash Sales</span>
          <span>$845.20</span>
        </div>
        <div className="flex justify-between">
          <span>Cash Refunds</span>
          <span>-$25.00</span>
        </div>
        <div className="flex justify-between">
          <span>Pay Ins</span>
          <span>$0.00</span>
        </div>
        <div className="flex justify-between">
          <span>Pay Outs</span>
          <span>-$50.00</span>
        </div>
      </div>

      <DottedLine />

      {/* Closing count */}
      <div className="font-bold text-xs uppercase mb-1">Closing Count</div>
      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Expected Cash</span>
          <span>$970.20</span>
        </div>
        <div className="flex justify-between">
          <span>Actual Count</span>
          <span>$968.75</span>
        </div>
      </div>

      <DoubleLine />

      <div className="flex justify-between font-bold text-sm text-red-600 dark:text-red-400">
        <span>Short</span>
        <span>-$1.45</span>
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
