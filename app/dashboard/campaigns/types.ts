import type { Database } from "@/database.types";

export type Campaign = Pick<Database["public"]["Tables"]["marketing_campaigns"]["Row"],
  "id" | "name" | "campaign_type" | "status" | "body" | "subject" |
  "created_at" | "scheduled_for" | "total_recipients">;

export type Message = Pick<Database["public"]["Tables"]["message_log"]["Row"],
  "id" | "body" | "campaign_id" | "created_at" | "direction" |
  "error_code" | "from_number" | "status" | "to_number">;

export type MessageFilters = {
  page?: number;
  search?: string;
  status?: string;
  direction?: string;
  days?: number;
  campaignId?: string;
};
