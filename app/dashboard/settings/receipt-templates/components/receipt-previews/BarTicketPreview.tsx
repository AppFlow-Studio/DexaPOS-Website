import { cn } from "@/lib/utils";
import type { ReceiptTemplateFormData } from "../../types";
import { ReceiptPaper, DottedLine, DoubleLine } from "./ReceiptPaper";
import { AlertTriangle, Clock } from "lucide-react";

interface BarTicketPreviewProps {
  formState: ReceiptTemplateFormData;
}

export function BarTicketPreview({ formState }: BarTicketPreviewProps) {
  return (
    <ReceiptPaper>
      {/* Order header */}
      <div className="text-center font-bold text-lg">ORDER #1042</div>
      <div className="text-center font-bold text-sm uppercase tracking-wide">
        BAR
      </div>
      {formState.show_order_type && (
        <div className="text-center font-semibold">DINE IN - Table 5</div>
      )}
      {formState.show_server_name && (
        <div className="text-center text-zinc-500">Server: Sarah M.</div>
      )}
      <div className="text-center text-zinc-500 text-[10px]">
        01/15/2026 12:34 PM
      </div>

      {formState.show_ready_by_time && (
        <div className="flex items-center justify-center gap-1 mt-1 font-bold text-sm">
          <Clock className="h-3 w-3" />
          <span>Ready by: 12:39 PM</span>
        </div>
      )}

      <DoubleLine />

      {/* Items */}
      <div className="space-y-2">
        <div>
          <div
            className={cn(
              "font-bold",
              formState.large_item_text ? "text-lg" : "text-sm",
            )}
          >
            2x Margarita
          </div>
          {formState.show_item_modifiers && (
            <div
              className={cn(
                "pl-3 text-zinc-600 dark:text-zinc-400",
                formState.show_mods_large
                  ? "text-sm font-semibold"
                  : "text-[10px]",
              )}
            >
              + Salt Rim, On the Rocks
            </div>
          )}
          {formState.show_allergy_alert && (
            <div className="flex items-center gap-1 pl-3 text-red-600 dark:text-red-400 font-bold text-[10px] mt-0.5">
              <AlertTriangle className="h-3 w-3" />
              ALLERGY: Citrus
            </div>
          )}
        </div>

        <div>
          <div
            className={cn(
              "font-bold",
              formState.large_item_text ? "text-lg" : "text-sm",
            )}
          >
            1x Old Fashioned
          </div>
          {formState.show_item_modifiers && (
            <div
              className={cn(
                "pl-3 text-zinc-600 dark:text-zinc-400",
                formState.show_mods_large
                  ? "text-sm font-semibold"
                  : "text-[10px]",
              )}
            >
              + Bulleit Bourbon
            </div>
          )}
        </div>

        <div>
          <div
            className={cn(
              "font-bold",
              formState.large_item_text ? "text-lg" : "text-sm",
            )}
          >
            1x Draft IPA
          </div>
        </div>
      </div>

      <DoubleLine />

      <div className="text-center text-zinc-500 text-[10px]">
        4 drinks total
      </div>
    </ReceiptPaper>
  );
}
