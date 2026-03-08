"use client";

import { useParams } from "next/navigation";
import { OrderDetailFullPage } from "@/components/dashboard/orders/OrderDetailFullPage";
import { useAdminAuth } from "@/lib/hooks/useAdminAuth";

export default function AdminOrderDetailPage() {
  const params = useParams();
  const merchantId = params.merchantId as string;
  const orderId = params.orderId as string;
  const { isHQAdmin } = useAdminAuth();

  return (
    <OrderDetailFullPage
      orderId={orderId}
      backUrl={`/manage/merchants/${merchantId}`}
      backLabel="Back to Merchant"
      breadcrumbs={[
        { label: "Merchants", href: "/manage/merchants" },
        { label: "Merchant", href: `/manage/merchants/${merchantId}` },
        { label: "Orders", href: `/manage/merchants/${merchantId}` },
        { label: `Order #${orderId.slice(0, 8)}...` },
      ]}
      readOnly={true}
      adminViewType={isHQAdmin ? "hq" : "carrier"}
    />
  );
}
