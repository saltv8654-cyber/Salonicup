import { documentUrl } from "@/lib/energy/fetch-source";
import { adminRoute, json } from "@/lib/energy/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Short-lived link to a stored copy of a source document (?path=…). */
export const GET = adminRoute(async (req) => {
  const path = req.nextUrl.searchParams.get("path");
  if (!path || path.includes("..")) return json({ error: "Μη έγκυρο αρχείο" }, 400);
  return json({ url: await documentUrl(path) });
});
