import type { Database } from "@/database.types";

export type Campaign = Pick<Database["public"]["Tables"]["marketing_campaigns"]["Row"],
  "id" | "name" | "campaign_type" | "status" | "body" | "subject" |
  "created_at" | "scheduled_for" | "total_recipients">;

export type Message = Omit<Database["public"]["Tables"]["message_log"]["Row"],
  "raw" | "merchant_id" | "recipient_id" | "customer_id">;

export type MessageFilters = {
  page?: number;
  search?: string;
  status?: string;
  direction?: string;
  days?: number;
  campaignId?: string;
};
