import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const STATUS_LABEL: Record<string, string> = {
  active: "Active", paused: "Paused", stopped_reply: "Replied", stopped_unsub: "Unsubscribed / bounced",
  stopped_signup: "Signed up", completed: "Completed",
};
export const CHANNEL_LABEL: Record<string, string> = { email: "Email", call_task: "Call task", dm_task: "DM task" };

/** Admin pause / resume / stop. Stopping also cancels that enrollment's unsent emails. */
export async function setEnrollmentStatus(id: string, status: "active" | "paused" | "completed" | "stopped_reply") {
  const patch: Database["public"]["Tables"]["agent_enrollments"]["Update"] = { status, stop_reason: status === "active" ? null : "stopped by admin" };
  if (status === "active") patch.next_due_at = new Date().toISOString();
  if (status !== "active" && status !== "paused") patch.stopped_at = new Date().toISOString();
  const { error } = await supabase.from("agent_enrollments").update(patch).eq("id", id);
  if (error) throw error;
  if (status !== "active" && status !== "paused") {
    await supabase.from("agent_outreach").update({ status: "skipped", error: "Sequence stopped by admin" })
      .eq("enrollment_id", id).in("status", ["pending", "approved", "drafting"]);
  }
}
