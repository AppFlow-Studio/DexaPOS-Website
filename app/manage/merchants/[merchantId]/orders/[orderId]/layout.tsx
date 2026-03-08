import { GetOrderDetails } from "@/app/dashboard/actions/order";
import type { Metadata } from "next";

type Props = { params: Promise<{ orderId: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderId } = await params;
  const order = await GetOrderDetails(orderId);
  const title = order
    ? `Order #${order.display_number ?? order.order_number} | DEXA POS`
    : "Order | DEXA POS";
  return { title };
}

export default function AdminOrderDetailLayout({ children }: Props) {
  return <>{children}</>;
}
