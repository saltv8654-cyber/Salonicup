import { redirect } from "next/navigation";
import { userClient } from "./supabase/server";

export interface Admin {
  userId: string;
  email: string | null;
}

/** Signed-in Salonicup admin (profiles.role = 'admin'), or null. Same accounts as the main app. */
export async function getAdmin(): Promise<Admin | null> {
  const db = userClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return null;
  return { userId: user.id, email: user.email ?? null };
}

export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/login?denied=1");
  return admin;
}
