import type { TemplateType, ReceiptTemplateFormData } from "../types";
import { SaleReceiptPreview } from "./receipt-previews/SaleReceiptPreview";
import { KitchenTicketPreview } from "./receipt-previews/KitchenTicketPreview";
import { VoidRefundReceiptPreview } from "./receipt-previews/VoidRefundReceiptPreview";
import { NoSaleReceiptPreview } from "./receipt-previews/NoSaleReceiptPreview";
import { EndOfDayReportPreview } from "./receipt-previews/EndOfDayReportPreview";
import { CashDrawerReportPreview } from "./receipt-previews/CashDrawerReportPreview";
import { OnlineOrderTicketPreview } from "./receipt-previews/OnlineOrderTicketPreview";

interface ReceiptPreviewProps {
  templateType: TemplateType;
  formState: ReceiptTemplateFormData;
}

export function ReceiptPreview({
  templateType,
  formState,
}: ReceiptPreviewProps) {
  switch (templateType) {
    case "sale":
      return <SaleReceiptPreview formState={formState} />;
    case "kitchen":
      return <KitchenTicketPreview formState={formState} />;
    case "void_refund":
      return <VoidRefundReceiptPreview formState={formState} />;
    case "no_sale":
      return <NoSaleReceiptPreview formState={formState} />;
    case "end_of_day":
      return <EndOfDayReportPreview formState={formState} />;
    case "cash_drawer":
      return <CashDrawerReportPreview formState={formState} />;
    case "online_order":
      return <OnlineOrderTicketPreview formState={formState} />;
    default:
      return <SaleReceiptPreview formState={formState} />;
  }
}
