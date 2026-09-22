import { DataPageSkeleton } from "@/components/dashboard/loading/DataPageSkeleton";

export default function CampaignsLoading() {
  return <DataPageSkeleton variant="table" shell="plain" label="Loading campaigns and messages" />;
}
