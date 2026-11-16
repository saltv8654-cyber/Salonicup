import { redirect } from "next/navigation";
import { userClient } from "./supabase/server";
import type { MemberRole, AutonomyMode } from "./policy";

export interface BusinessAccess {
  userId: string;
  role: MemberRole;
  business: {
    id: string; org_id: string; name: string; industry: string | null; description: string | null;
    website: string | null; language: string; timezone: string;
    autonomy_mode: AutonomyMode; autonomy_paused: boolean; paused_reason: string | null;
  };
  org: { id: string; name: string; plan_id: string; agent_enabled: boolean };
}

/**
 * Resolves the signed-in user's access to a business through RLS (a user who is not a member
 * simply gets no row). Returns null when there is no session or no access.
 */
export async function getBusinessAccess(businessId: string): Promise<BusinessAccess | null> {
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) return null;
  const db = userClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: business } = await db.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (!business) return null;
  const [{ data: member }, { data: org }] = await Promise.all([
    db.from("organization_members").select("role").eq("org_id", business.org_id).eq("user_id", user.id).maybeSingle(),
    db.from("organizations").select("id,name,plan_id,agent_enabled").eq("id", business.org_id).single(),
  ]);
  if (!member || !org) return null;
  return { userId: user.id, role: member.role, business, org };
}

/** For pages: redirect away instead of returning null. */
export async function requireBusinessAccess(businessId: string): Promise<BusinessAccess> {
  const access = await getBusinessAccess(businessId);
  if (!access) redirect("/");
  return access;
}
