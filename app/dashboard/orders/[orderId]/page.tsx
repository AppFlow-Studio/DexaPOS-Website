"use client";

import { useParams } from "next/navigation";
import { OrderDetailFullPage } from "@/components/dashboard/orders/OrderDetailFullPage";

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.orderId as string;

  return (
    <OrderDetailFullPage
      orderId={orderId}
      backUrl="/dashboard/orders"
      backLabel="Back to Orders"
      breadcrumbs={[
        { label: "Orders", href: "/dashboard/orders" },
        { label: `Order #${orderId.slice(0, 8)}...` },
      ]}
      readOnly={false}
    />
  );
}
