"use server";

import { auth } from "@clerk/nextjs/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function GetCustomerFeedback(customerId: string) {
  if (!customerId) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("customer_feedback")
    .select(
      `
      *,
      server:staff_profiles!customer_feedback_server_staff_id_fkey(first_name, last_name, display_name),
      order:orders(display_number)
      `
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GetCustomerFeedback]", error);
    return [];
  }
  return data || [];
}

export async function AddFeedbackResponse(
  feedbackId: string,
  response: string
) {
  const { userId } = await auth();
  if (!userId) return { error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("customer_feedback")
    .update({
      response,
      responded_at: new Date().toISOString(),
      responded_by: userId,
    })
    .eq("id", feedbackId);

  if (error) {
    console.error("[AddFeedbackResponse]", error);
    return { error: error.message };
  }
  return { success: true };
}

export async function UpdateFeedbackFlag(
  feedbackId: string,
  isFlagged: boolean
) {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("customer_feedback")
    .update({ is_flagged: isFlagged })
    .eq("id", feedbackId);

  if (error) {
    console.error("[UpdateFeedbackFlag]", error);
    return { error: error.message };
  }
  return { success: true };
}
