import { NextResponse } from "next/server";
import { mailConfigured, sendMail, signToken, siteUrl } from "@/lib/mailer";
import { tooManyAttempts, userRoute } from "@/lib/user-auth";

export const runtime = "nodejs";

/** Send a confirmation link; alerts are e-mailed only to confirmed addresses. */
export const POST = userRoute(async (_req, user) => {
  if (!mailConfigured()) return NextResponse.json({ error: "Η αποστολή email δεν έχει ρυθμιστεί ακόμα" }, { status: 503 });
  if (!user.email) return NextResponse.json({ error: "Ο λογαριασμός δεν έχει email" }, { status: 400 });
  if (tooManyAttempts(`verify:${user.id}`, 3, 60 * 60_000)) return NextResponse.json({ error: "Στάλθηκε ήδη. Δοκίμασε σε λίγο." }, { status: 429 });
  const link = `${siteUrl()}/api/account/verify?token=${encodeURIComponent(signToken("verify", user.id, 48))}`;
  const ok = await sendMail(user.email, "Billi: επιβεβαίωσε το email σου",
    `Πάτα τον σύνδεσμο για να λαμβάνεις τις ειδοποιήσεις τιμών του Billi:\n${link}\n\nΑν δεν το ζήτησες εσύ, αγνόησε αυτό το μήνυμα.`,
    `<p>Πάτα για να λαμβάνεις τις ειδοποιήσεις τιμών του Billi:</p><p><a href="${link}">Επιβεβαίωση email</a></p><p style="color:#888;font-size:12px">Αν δεν το ζήτησες εσύ, αγνόησε αυτό το μήνυμα.</p>`);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Η αποστολή απέτυχε" }, { status: 502 });
});
