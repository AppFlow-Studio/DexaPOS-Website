import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// KDS device truth moved into the KDS mirror page as its "Device truth" tab.
//
// This route is kept as a redirect so existing bookmarks / deep links keep
// working: /manage/support/kds-truth?merchant=&location=&display= lands on the
// mirror page with the Device truth tab selected.
// ---------------------------------------------------------------------------

export default function KdsDeviceTruthRedirect({
  searchParams,
}: {
  searchParams: { merchant?: string; location?: string; display?: string };
}) {
  const params = new URLSearchParams();
  params.set("tab", "device-truth");
  if (searchParams.merchant) params.set("merchant", searchParams.merchant);
  if (searchParams.location) params.set("location", searchParams.location);
  if (searchParams.display) params.set("display", searchParams.display);

  redirect(`/manage/support/kds-mirror?${params.toString()}`);
}
