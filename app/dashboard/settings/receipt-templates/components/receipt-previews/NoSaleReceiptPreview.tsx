import type { ReceiptTemplateFormData } from "../../types";
import { ReceiptPaper, DottedLine, DoubleLine } from "./ReceiptPaper";

interface NoSaleReceiptPreviewProps {
  formState: ReceiptTemplateFormData;
}

export function NoSaleReceiptPreview({ formState }: NoSaleReceiptPreviewProps) {
  return (
    <ReceiptPaper>
      {formState.show_logo && (
        <div className="text-center mb-2">
          <div className="inline-block w-10 h-10 bg-zinc-300 dark:bg-zinc-700 rounded" />
        </div>
      )}

      {/* NO SALE Banner */}
      <div className="text-center font-bold text-xl border-2 border-zinc-400 text-zinc-600 dark:text-zinc-400 py-1 mb-2">
        NO SALE
      </div>

      <div className="text-center font-bold text-sm">Sample Restaurant</div>
      {formState.header_text && (
        <div className="text-center text-[10px] mt-1 whitespace-pre-wrap">
          {formState.header_text}
        </div>
      )}

      <DoubleLine />

      <div className="flex justify-between text-[11px]">
        <span>Station:</span>
        <span>Register 1</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span>Date:</span>
        <span>01/15/2026</span>
      </div>
      <div className="flex justify-between text-[11px]">
        <span>Time:</span>
        <span>2:30 PM</span>
      </div>

      <DottedLine />

      {formState.show_server_name && (
        <div className="flex justify-between text-[11px]">
          <span>Opened by:</span>
          <span>Sarah M.</span>
        </div>
      )}

      <DottedLine />

      <div className="text-center text-[10px] text-zinc-500">
        Cash drawer opened — no transaction
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
