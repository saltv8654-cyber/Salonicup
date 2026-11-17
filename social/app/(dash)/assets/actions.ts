"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/access";
import { serviceClient } from "@/lib/supabase/server";
import { BUCKET } from "@/lib/graphics/store";
import { logActivity } from "@/lib/activity";

const KINDS = ["image", "video", "logo", "font", "template", "document", "audio"] as const;
const MAX = 200 * 1024 * 1024;
const ALLOWED = /^(image\/(png|jpeg|webp|gif|svg\+xml)|video\/(mp4|quicktime|webm)|audio\/[\w.+-]+|font\/[\w.+-]+|application\/(pdf|octet-stream|font-woff))$/;

/**
 * Step 1: a one-time signed upload URL. The browser uploads straight to Supabase Storage,
 * so large files (videos) never pass through the Vercel function (4.5 MB request limit).
 */
export async function prepareUpload(name: string, type: string, size: number) {
  await requireAdmin();
  if (!size || size > MAX) throw new Error("Μέγιστο μέγεθος 200 MB");
  if (!ALLOWED.test(type || "application/octet-stream")) throw new Error(`Μη αποδεκτός τύπος: ${type || "άγνωστος"}`);
  const safe = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").slice(-80);
  const path = `uploads/${new Date().toISOString().slice(0, 7)}/${randomUUID()}-${safe}`;
  const { data, error } = await serviceClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "upload url");
  return { path, token: data.token };
}

/** Step 2: record the uploaded file in the Asset Library (only if it really is in the bucket). */
export async function recordUpload(input: { path: string; kind: string; title: string; tags: string; mime: string; bytes: number; width?: number; height?: number }) {
  const a = await requireAdmin();
  if (!input.path.startsWith("uploads/")) throw new Error("invalid path");
  const db = serviceClient();
  const dir = input.path.slice(0, input.path.lastIndexOf("/"));
  const { data: listed } = await db.storage.from(BUCKET).list(dir, { search: input.path.slice(dir.length + 1) });
  if (!listed?.length) throw new Error("Το αρχείο δεν βρέθηκε στο storage");
  const kind = KINDS.find((k) => k === input.kind) ?? "image";
  const tags = input.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  const { data, error } = await db.from("social_assets").insert({
    kind, storage_path: input.path, mime: input.mime || null, bytes: input.bytes, width: input.width ?? null, height: input.height ?? null,
    tags, source: "upload", title: input.title.trim() || input.path.split("/").pop(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  await logActivity({ actorType: "user", actorId: a.userId, action: "asset.uploaded", targetType: "asset", targetId: data.id, details: { kind, bytes: input.bytes } });
  revalidatePath("/assets");
}

export async function archiveAsset(id: string) {
  const a = await requireAdmin();
  const { error } = await serviceClient().from("social_assets").update({ archived: true }).eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity({ actorType: "user", actorId: a.userId, action: "asset.archived", targetType: "asset", targetId: id });
  revalidatePath("/assets");
}
