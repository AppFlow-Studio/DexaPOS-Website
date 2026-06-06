import { GetOrderDetails } from "@/app/dashboard/actions/order";
import type { Metadata } from "next";

type Props = { params: Promise<{ orderId: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: "Order | DEXA POS" };
}

export default function OrderDetailLayout({ children }: Props) {
  return <>{children}</>;
}
