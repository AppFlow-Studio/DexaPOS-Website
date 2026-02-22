import { cn } from "@/lib/utils";
import type { ReceiptTemplateFormData } from "../../types";
import { ReceiptPaper, DottedLine, DoubleLine } from "./ReceiptPaper";
import { AlertTriangle, Clock } from "lucide-react";

interface KitchenTicketPreviewProps {
  formState: ReceiptTemplateFormData;
}

export function KitchenTicketPreview({
  formState,
}: KitchenTicketPreviewProps) {
  return (
    <ReceiptPaper>
      {/* Order header - always bold and large */}
      <div className="text-center font-bold text-lg">ORDER #1042</div>
      {formState.show_order_type && (
        <div className="text-center font-semibold">DINE IN - Table 5</div>
      )}
      {formState.show_server_name && (
        <div className="text-center text-zinc-500">Server: Sarah M.</div>
      )}
      <div className="text-center text-zinc-500 text-[10px]">
        01/15/2026 12:34 PM
      </div>

      {/* Ready by time */}
      {formState.show_ready_by_time && (
        <div className="flex items-center justify-center gap-1 mt-1 font-bold text-sm">
          <Clock className="h-3 w-3" />
          <span>Ready by: 12:49 PM</span>
        </div>
      )}

      <DoubleLine />

      {/* Station grouping */}
      {formState.group_by_station && (
        <div className="text-center font-bold text-xs uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 py-0.5 -mx-4 px-4 mb-2">
          GRILL STATION
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        <div>
          <div
            className={cn(
              "font-bold",
              formState.large_item_text ? "text-lg" : "text-sm",
            )}
          >
            1x Cheeseburger
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
              + Extra Cheese
              <br />
              - No Onions
            </div>
          )}
          {/* Allergy alert */}
          {formState.show_allergy_alert && (
            <div className="flex items-center gap-1 pl-3 text-red-600 dark:text-red-400 font-bold text-[10px] mt-0.5">
              <AlertTriangle className="h-3 w-3" />
              ALLERGY: Dairy
            </div>
          )}
        </div>

        {formState.group_by_station && (
          <>
            <DottedLine />
            <div className="text-center font-bold text-xs uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 py-0.5 -mx-4 px-4 mb-2">
              SALAD STATION
            </div>
          </>
        )}

        <div>
          <div
            className={cn(
              "font-bold",
              formState.large_item_text ? "text-lg" : "text-sm",
            )}
          >
            1x Caesar Salad
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
              + Grilled Chicken
            </div>
          )}
        </div>
      </div>

      <DoubleLine />

      <div className="text-center text-zinc-500 text-[10px]">
        2 items total
      </div>
    </ReceiptPaper>
  );
}
