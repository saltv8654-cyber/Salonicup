import { get, put } from "@vercel/blob";
import bundled from "@/data/tariffs.json";
import type { TariffFile } from "./types";

const PATH = "tariffs/latest.json";

/** A connected store exposes either a read-write token or, on newer projects, a store id used with Vercel OIDC. */
export const blobConfigured = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/** Latest synced snapshot from Vercel Blob; falls back to the bundled file when no store is connected yet. */
export async function loadTariffs(): Promise<TariffFile> {
  if (!blobConfigured()) return bundled as TariffFile;
  try {
    const res = await get(PATH, { access: "public", useCache: false });
    if (res) return (await new Response(res.stream).json()) as TariffFile;
  } catch (e) {
    console.error("loadTariffs:", e);
  }
  return bundled as TariffFile;
}

export async function saveTariffs(data: TariffFile) {
  await put(PATH, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
}
