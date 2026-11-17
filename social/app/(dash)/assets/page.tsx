import Link from "next/link";
import { serviceClient, userClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { signedUrls } from "@/lib/posts/store";
import { PageHeader, Badge, Empty, fmtDate } from "@/app/ui";
import { archiveAsset } from "./actions";
import { Upload } from "./upload";

export const dynamic = "force-dynamic";

export default async function Assets({ searchParams }: { searchParams: { tag?: string } }) {
  const tz = (await getSettings())!.timezone;
  let q = userClient().from("social_assets").select("*").eq("archived", false).order("created_at", { ascending: false }).limit(60);
  if (searchParams.tag) q = q.contains("tags", [searchParams.tag]);
  const { data: assets } = await q;
  const urls = await signedUrls(serviceClient(), (assets ?? []).map((a) => a.storage_path));
  const tags = [...new Set((assets ?? []).flatMap((a) => a.tags as string[]))].sort();
  return (
    <>
      <PageHeader title="Asset Library" subtitle="Ιδιωτικό bucket «social-assets». Τα γραφικά του agent και του Studio αποθηκεύονται εδώ αυτόματα."
        actions={<Link className="btn-primary" href="/studio">◧ Νέο γραφικό</Link>} />
      <Upload />
      {tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link href="/assets" className={!searchParams.tag ? "font-semibold" : "muted"}>Όλα</Link>
          {tags.map((t) => <Link key={t} href={`/assets?tag=${encodeURIComponent(t)}`} className={searchParams.tag === t ? "font-semibold" : "muted"}>#{t}</Link>)}
        </div>
      )}
      {assets?.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => {
            const url = urls[a.storage_path];
            return (
              <div key={a.id} className="card p-2">
                <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
                  {url && (a.mime ?? "").startsWith("image/")
                    ? <img src={url} alt={a.title ?? ""} className="aspect-[4/5] w-full object-contain" loading="lazy" />
                    : <div className="flex aspect-[4/5] items-center justify-center text-sm text-slate-500">{a.kind} · {a.mime ?? "αρχείο"}</div>}
                </a>
                <p className="mt-2 truncate text-sm font-medium">{a.title ?? a.storage_path.split("/").pop()}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <Badge tone={a.source === "generated" ? "indigo" : "slate"}>{a.source === "generated" ? "AI agent / Studio" : "upload"}</Badge>
                  {a.width && <span className="muted text-xs">{a.width}×{a.height}</span>}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="muted text-xs">{fmtDate(a.created_at, tz)}</span>
                  <form action={archiveAsset.bind(null, a.id)}><button className="text-xs text-rose-600 hover:underline">Αρχειοθέτηση</button></form>
                </div>
              </div>
            );
          })}
        </div>
      ) : <Empty title="Κανένα asset ακόμα" href="/studio" cta="Δημιουργία γραφικού">Ανέβασε λογότυπα και φωτογραφίες ή φτιάξε γραφικό στο Studio.</Empty>}
    </>
  );
}
