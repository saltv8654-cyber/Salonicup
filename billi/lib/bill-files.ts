import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";

/** Private Storage bucket for bills the visitor chose to attach to their request. Created on first use. */
const BUCKET = "bills";
export const MAX_BILL_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies
export const BILL_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface BillFile {
  path: string;
  name: string;
  type: string;
  size: number;
  uploaded_at: string;
}

/** Proof that the browser which created the lead is the one attaching the file. */
export function attachToken(leadId: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(`bill-attach:${leadId}`).digest("hex");
}

export function attachTokenValid(leadId: string, token: string): boolean {
  const want = Buffer.from(attachToken(leadId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

async function ensureBucket() {
  const { error } = await db().storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BILL_BYTES });
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(error.message);
}

export async function uploadBill(leadId: string, data: Buffer, type: string, name: string): Promise<BillFile> {
  const path = `${leadId}/${Date.now()}.${BILL_TYPES[type]}`;
  const put = () => db().storage.from(BUCKET).upload(path, data, { contentType: type, upsert: false });
  let { error } = await put();
  if (error && /bucket.*not.*found|not found/i.test(error.message)) {
    await ensureBucket();
    ({ error } = await put());
  }
  if (error) throw new Error(error.message);
  return { path, name: name.slice(0, 200), type, size: data.length, uploaded_at: new Date().toISOString() };
}

/** Short-lived link so the file is never publicly reachable. */
export async function billUrl(path: string, seconds = 300): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(error?.message ?? "signed url failed");
  return data.signedUrl;
}

export async function removeBill(path: string) {
  const { error } = await db().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export const billFileOf = (bill: unknown): BillFile | null => {
  const f = (bill as { _file?: BillFile } | null)?._file;
  return f && typeof f.path === "string" ? f : null;
};
