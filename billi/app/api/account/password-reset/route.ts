import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbConfigured } from "@/lib/db";
import { mailConfigured, sendMail, signToken, siteUrl } from "@/lib/mailer";
import { tooManyAttempts } from "@/lib/user-auth";

export const runtime = "nodejs";

/** Always answers the same, so it can't be used to find out who has an account. */
export async function POST(req: NextRequest) {
  if (!dbConfigured() || !mailConfigured()) return NextResponse.json({ error: "Η επαναφορά κωδικού δεν είναι ακόμα διαθέσιμη. Επικοινώνησε μαζί μας." }, { status: 503 });
  const parsed = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Μη έγκυρο email" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooManyAttempts(`reset:${ip}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Πολλές προσπάθειες. Δοκίμασε αργότερα." }, { status: 429 });
  // Find the user by e-mail (paged admin listing; fine for a few thousand accounts).
  for (let page = 1; page <= 20; page++) {
    const { data } = await db().auth.admin.listUsers({ page, perPage: 1000 });
    const u = data?.users.find((x) => x.email?.toLowerCase() === parsed.data.email);
    if (u) {
      const link = `${siteUrl()}/account?reset=${encodeURIComponent(signToken("reset", u.id, 1))}`;
      await sendMail(parsed.data.email, "Billi: νέος κωδικός", `Για νέο κωδικό πάτα (ισχύει 1 ώρα):\n${link}\n\nΑν δεν το ζήτησες εσύ, αγνόησε αυτό το μήνυμα.`);
      break;
    }
    if (!data || data.users.length < 1000) break;
  }
  return NextResponse.json({ ok: true });
}
