import { redirect } from "next/navigation";

export default async function MerchantKioskLocationAliasPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  redirect(`/dashboard/kiosk/${locationId}`);
}
