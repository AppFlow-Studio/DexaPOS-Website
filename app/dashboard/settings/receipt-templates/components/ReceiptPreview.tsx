import type { TemplateType, ReceiptTemplateFormData, LocationIdentity } from "../types";
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
  locationIdentity?: LocationIdentity;
}

export function ReceiptPreview({
  templateType,
  formState,
  locationIdentity,
}: ReceiptPreviewProps) {
  switch (templateType) {
    case "sale":
      return <SaleReceiptPreview formState={formState} locationIdentity={locationIdentity} />;
    case "kitchen":
      return <KitchenTicketPreview formState={formState} />;
    case "void_refund":
      return <VoidRefundReceiptPreview formState={formState} locationIdentity={locationIdentity} />;
    case "no_sale":
      return <NoSaleReceiptPreview formState={formState} locationIdentity={locationIdentity} />;
    case "end_of_day":
      return <EndOfDayReportPreview formState={formState} locationIdentity={locationIdentity} />;
    case "cash_drawer":
      return <CashDrawerReportPreview formState={formState} locationIdentity={locationIdentity} />;
    case "online_order":
      return <OnlineOrderTicketPreview formState={formState} locationIdentity={locationIdentity} />;
    default:
      return <SaleReceiptPreview formState={formState} locationIdentity={locationIdentity} />;
  }
}
