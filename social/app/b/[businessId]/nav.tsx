"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SECTIONS, EXTRA } from "@/lib/nav";

export function Nav({ base, pending }: { base: string; pending: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const item = (slug: string, label: string, icon: string, dim = false, badge?: number) => {
    const href = slug ? `${base}/${slug}` : base;
    const active = slug ? path.startsWith(href) : path === base;
    return (
      <Link key={slug || "home"} href={href} onClick={() => setOpen(false)}
        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active
          ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"} ${dim ? "opacity-60" : ""}`}>
        <span className="w-4 text-center">{icon}</span>
        <span className="flex-1">{label}</span>
        {badge ? <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{badge}</span> : null}
      </Link>
    );
  };
  return (
    <>
      <button className="btn-ghost fixed left-3 top-3 z-40 lg:hidden" onClick={() => setOpen(!open)} aria-label="Μενού">☰</button>
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 overflow-y-auto border-r border-slate-200 bg-white p-3 pt-16 transition-transform dark:border-slate-800 dark:bg-slate-900 lg:translate-x-0 lg:pt-4 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-indigo-600">Social Agent</p>
        <nav className="space-y-0.5">{SECTIONS.map((s) => item(s.slug, s.label, s.icon, !s.active))}</nav>
        <div className="my-3 border-t border-slate-200 dark:border-slate-800" />
        <nav className="space-y-0.5">{EXTRA.map((s) => item(s.slug, s.label, s.icon, false, s.slug === "approvals" ? pending : undefined))}</nav>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}
