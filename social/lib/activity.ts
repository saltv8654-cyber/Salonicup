import { serviceClient } from "./supabase/server";

export async function logActivity(e: {
  actorType: "user" | "agent" | "system";
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  const { error } = await serviceClient().from("social_activity").insert({
    actor_type: e.actorType, actor_id: e.actorId ?? null, action: e.action,
    target_type: e.targetType ?? null, target_id: e.targetId ?? null, details: e.details ?? {},
  });
  // Auditing must never be silently lost.
  if (error) console.error("social_activity insert failed", e.action, error.message);
}
