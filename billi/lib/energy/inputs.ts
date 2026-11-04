import { z } from "zod";
import { sourceUrlAllowed } from "./fetch-source";
import { normaliseSiteUrl } from "./discover";

export const SourceInput = z.object({
  provider_id: z.string().uuid().nullable(),
  label: z.string().trim().min(1, "Γράψε όνομα πηγής").max(200),
  // "dei.gr" is accepted and becomes https://dei.gr
  url: z.preprocess((v) => (typeof v === "string" && v.trim() ? normaliseSiteUrl(v) : v), z.string().url("Μη έγκυρο link").max(1000).refine(sourceUrlAllowed, "Μόνο links https")),
  kind: z.enum(["auto", "html", "pdf", "site"]).default("auto"),
  segment: z.enum(["residential", "business", "both"]).default("residential"),
  enabled: z.boolean().default(true),
  check_every_hours: z.number().int().min(1).max(720).default(24),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const ProviderInput = z.object({
  name: z.string().trim().min(1, "Γράψε όνομα").max(100),
  aliases: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  website: z.union([z.literal(""), z.string().trim().url("Μη έγκυρο link").max(300)]).nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().trim().max(1000).nullable().optional(),
});
