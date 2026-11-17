"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import { prepareUpload, recordUpload } from "./actions";

const imageSize = (file: File) => new Promise<{ width?: number; height?: number }>((resolve) => {
  if (!file.type.startsWith("image/")) return resolve({});
  const img = new Image();
  img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src); };
  img.onerror = () => resolve({});
  img.src = URL.createObjectURL(file);
});

export function Upload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File | null;
    if (!file?.size) return;
    setBusy(true); setMsg(null);
    try {
      const { path, token } = await prepareUpload(file.name, file.type, file.size);
      const { error } = await browserClient().storage.from("social-assets").uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      await recordUpload({ path, kind: String(form.get("kind")), title: String(form.get("title") ?? ""), tags: String(form.get("tags") ?? ""),
        mime: file.type, bytes: file.size, ...(await imageSize(file)) });
      (e.target as HTMLFormElement).reset();
      setMsg("Ανέβηκε.");
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card mb-6 grid gap-3 sm:grid-cols-[1fr_140px_1fr_1fr_auto] sm:items-end">
      <div><label className="label" htmlFor="file">Αρχείο (έως 200 MB)</label><input id="file" name="file" type="file" required className="input" /></div>
      <div><label className="label" htmlFor="kind">Είδος</label>
        <select id="kind" name="kind" className="input">{["image", "logo", "video", "template", "font", "document", "audio"].map((k) => <option key={k}>{k}</option>)}</select></div>
      <div><label className="label" htmlFor="title">Τίτλος</label><input id="title" name="title" className="input" placeholder="π.χ. Λογότυπο χορηγού" /></div>
      <div><label className="label" htmlFor="tags">Tags</label><input id="tags" name="tags" className="input" placeholder="χορηγός, φωτογραφία" /></div>
      <button className="btn-primary" disabled={busy}>{busy ? "Ανέβασμα…" : "Ανέβασμα"}</button>
      {msg && <p className="text-sm sm:col-span-5">{msg}</p>}
    </form>
  );
}
