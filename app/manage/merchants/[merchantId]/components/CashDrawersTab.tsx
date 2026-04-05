"use client";

import { CashDrawerAnalytics } from "@/app/manage/cash-drawers/components/CashDrawerAnalytics";

export function CashDrawersTab({ merchantId }: { merchantId: string }) {
  return <CashDrawerAnalytics lockedMerchantId={merchantId} />;
}
