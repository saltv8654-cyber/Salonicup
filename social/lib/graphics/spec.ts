import { z } from "zod";
import { FORMATS, TEMPLATES, type FormatId, type TemplateId } from "./theme";

export const Spec = z.object({
  template: z.enum(Object.keys(TEMPLATES) as [TemplateId, ...TemplateId[]]),
  format: z.enum(Object.keys(FORMATS) as [FormatId, ...FormatId[]]).default("post"),
  match_id: z.string().uuid().optional(),
  league_id: z.string().uuid().optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
});

/** From URL search params, ignoring empty values. */
export const specFromParams = (p: URLSearchParams) =>
  Spec.safeParse(Object.fromEntries([...p.entries()].filter(([, v]) => v !== "")));
