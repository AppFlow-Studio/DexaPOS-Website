"use client";

import { CashDrawerAnalytics } from "@/app/manage/cash-drawers/components/CashDrawerAnalytics";
import { MerchantDrawerSetupCard } from "./MerchantDrawerSetupCard";

interface SimpleLocation {
  id: string;
  name: string;
}

export function CashDrawersTab({
  merchantId,
  locations,
}: {
  merchantId: string;
  locations: SimpleLocation[];
}) {
  return (
    <div className="space-y-6">
      <MerchantDrawerSetupCard merchantId={merchantId} locations={locations} />
      <CashDrawerAnalytics lockedMerchantId={merchantId} />
    </div>
  );
}
