import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GraphicSpec, Rendered } from "./render";

export const BUCKET = "social-assets";

/** Stores a rendered graphic in the private bucket, records it in the Asset Library and optionally attaches it to a draft. */
export async function saveGraphic(db: SupabaseClient, r: Rendered, spec: GraphicSpec, contentId?: string | null) {
  const month = new Date().toISOString().slice(0, 7);
  const path = `generated/${month}/${spec.template}-${spec.format}-${randomUUID()}.png`;
  const up = await db.storage.from(BUCKET).upload(path, r.png, { contentType: "image/png", upsert: false });
  if (up.error) throw new Error(`storage upload: ${up.error.message}`);
  const { data: asset, error } = await db.from("social_assets").insert({
    kind: "image", storage_path: path, mime: "image/png", width: r.width, height: r.height, bytes: r.png.length,
    tags: ["graphic", spec.template, spec.format], source: "generated", match_id: r.match_id, title: r.title,
  }).select("id").single();
  if (error || !asset) throw new Error(`social_assets: ${error?.message}`);
  if (contentId) await attachAsset(db, contentId, asset.id);
  return { asset_id: asset.id as string, path };
}

export async function attachAsset(db: SupabaseClient, contentId: string, assetId: string) {
  const { data: item, error } = await db.from("social_content").select("asset_ids").eq("id", contentId).single();
  if (error || !item) throw new Error("content item not found");
  const ids = [...new Set([...(item.asset_ids ?? []), assetId])];
  const { error: e2 } = await db.from("social_content").update({ asset_ids: ids }).eq("id", contentId);
  if (e2) throw new Error(e2.message);
}

/** Short-lived links for showing private assets in the dashboard. */
export async function signedUrls(db: SupabaseClient, paths: string[], seconds = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, seconds);
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl as string]));
}
