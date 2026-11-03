import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, dbConfigured } from "@/lib/db";
import { EVENT_NAMES } from "@/lib/track";
import { parseUserAgent } from "@/lib/ua";

export const runtime = "nodejs";

const Event = z.object({
  name: z.enum(EVENT_NAMES),
  path: z.string().max(300).optional(),
  props: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).optional(),
  source: z.record(z.string(), z.string().max(500)).optional(),
  session_id: z.string().max(64).optional(),
});

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export async function POST(req: NextRequest) {
  if (!dbConfigured()) return new NextResponse(null, { status: 204 });
  const parsed = Event.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const e = parsed.data;

  // Device and location come from the request, not the client, so they can't be spoofed into odd values.
  const city = req.headers.get("x-vercel-ip-city");
  const ctx = {
    ...parseUserAgent(req.headers.get("user-agent") ?? ""),
    country: req.headers.get("x-vercel-ip-country") ?? null,
    city: city ? safeDecode(city) : null,
  };

  const { error } = await db().from("events").insert({
    name: e.name,
    path: e.path ?? null,
    props: { ...(e.props ?? {}), ...ctx },
    source: e.source ?? null,
    session_id: e.session_id ?? null,
  });
  if (error) console.error("track insert failed:", error);
  return new NextResponse(null, { status: 204 });
}
