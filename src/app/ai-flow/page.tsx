"use client";

import { useEffect, useMemo, useState } from "react";
import type { Batch } from "@/lib/batches";

const STYLES = [
  ["single-image", "Single Image", "Hero visual"],
  ["bottom-banner", "Bottom Banner", "Calm lower area"],
  ["big-text-overlay", "Big Text Overlay", "Strong negative space"],
  ["top-bottom", "Top + Bottom", "Two-zone editorial"],
  ["centre", "Centre Composition", "Balanced subject"],
  ["collage-3", "3-Scene Editorial", "Three distinct scenes"],
  ["collage-4", "4-Scene Moodboard", "Four distinct scenes"],
] as const;

export default function CreateWithAI() {
  const [articleUrls, setArticleUrls] = useState("");
  const [pinsPerArticle, setPinsPerArticle] = useState(3);
  const [styleIds, setStyleIds] = useState<string[]>(["single-image", "bottom-banner", "big-text-overlay"]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [run, setRun] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const uniqueUrls = useMemo(
    () => Array.from(new Set(articleUrls.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean))),
    [articleUrls]
  );

  useEffect(() => {
    fetch("/api/batches").then((r) => r.json()).then((data) => setBatches(data || [])).catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    if (!run?.id) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/ai-flow/jobs?runId=${encodeURIComponent(run.id)}`, {
          headers: { "x-api-secret": process.env.NEXT_PUBLIC_APP_API_SECRET || "" },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!stopped) {
          setRun(data.run);
          setJobs(data.jobs || []);
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => { stopped = true; clearInterval(id); };
  }, [run?.id]);

  function toggleStyle(id: string) {
    setStyleIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  async function createRun() {
    setError("");
    setRun(null);
    setJobs([]);
    if (!uniqueUrls.length) return setError("Article links paste karo.");
    if (!styleIds.length) return setError("Kam se kam ek AI style select karo.");
    setLoading(true);
    try {
      const res = await fetch("/api/ai-flow/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": process.env.NEXT_PUBLIC_APP_API_SECRET || "",
        },
        body: JSON.stringify({ articleUrls: articleUrls, pinsPerArticle, styleIds, batchId: batchId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI run create nahi hua");
      setRun(data.run);
      setJobs(data.jobs || []);
    } catch (e: any) {
      setError(e.message || "AI run create nahi hua");
    } finally {
      setLoading(false);
    }
  }

  const queued = jobs.filter((j) => j.status === "queued").length;
  const processing = jobs.filter((j) => j.status === "processing").length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const failed = jobs.filter((j) => j.status === "failed").length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-accent font-medium">Google Flow AI</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create Pins with AI</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Bulk article links do. App article content se grounded image prompts + Pinterest metadata banayegi,
          phir local browser worker tumhare already-logged-in Google Flow ko use karke fresh AI visuals generate/download karega.
          Worker Google Flow mein 9:16 ratio automatically select karta hai. Generated images metadata cleanup ke baad automatically Posts → Batch mein aa jayengi, aur selected styles ke liye headline/CTA/footer typography final image par crisp render hoti hai.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <section className="rounded-2xl border border-border bg-surface p-5">
          <label className="text-sm font-medium">Article links</label>
          <textarea
            value={articleUrls}
            onChange={(e) => setArticleUrls(e.target.value)}
            rows={10}
            placeholder={"https://example.com/article-one\nhttps://example.com/article-two"}
            className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <p className="mt-2 text-xs text-muted">{uniqueUrls.length} unique articles · max 50</p>

          <div className="mt-6">
            <label className="text-sm font-medium">Pins per article</label>
            <select
              value={pinsPerArticle}
              onChange={(e) => setPinsPerArticle(Number(e.target.value))}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} pin{n !== 1 ? "s" : ""} per article</option>)}
            </select>
            <p className="mt-2 text-xs text-muted">Agar pins 5 aur styles 3 hain, styles cycle honge lekin har variant ka visual prompt alag hoga.</p>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">AI visual styles</label>
              <span className="text-xs text-muted">{styleIds.length} selected</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {STYLES.map(([id, label, hint]) => {
                const active = styleIds.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleStyle(id)}
                    className={`rounded-xl border p-4 text-left transition ${active ? "border-accent bg-accent/10" : "border-border hover:border-muted"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{label}</span>
                      <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${active ? "border-accent bg-accent text-white" : "border-border"}`}>{active ? "✓" : ""}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-medium">Save generated posts in batch</label>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-accent">
              <option value="">Unsorted</option>
              {batches.map((batch) => <option key={batch.id} value={batch.id} disabled={batch.status !== "pending"}>{batch.name}{batch.accountLabel ? ` · ${batch.accountLabel}` : ""}</option>)}
            </select>
          </div>

          {error && <div className="mt-5 whitespace-pre-wrap rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}

          <button
            onClick={createRun}
            disabled={loading || !styleIds.length}
            className="mt-6 rounded-full bg-accent px-6 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Reading articles & preparing prompts…" : "Create AI Flow run"}
          </button>
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-accent font-medium">How it works</p>
            <ol className="mt-4 space-y-3 text-sm text-muted">
              <li><b className="text-foreground">1.</b> Article content scrape hota hai.</li>
              <li><b className="text-foreground">2.</b> Gemini har selected style ke liye grounded Flow prompt + Pinterest metadata banata hai.</li>
              <li><b className="text-foreground">3.</b> Local Flow Worker browser kholta hai aur tumhare Google account ki existing session use karta hai.</li>
              <li><b className="text-foreground">4.</b> Flow se original-size image download hoti hai.</li>
              <li><b className="text-foreground">5.</b> Image ko re-encode karke EXIF/XMP/IPTC metadata strip kiya jata hai.</li>
              <li><b className="text-foreground">6.</b> Image + metadata Posts → selected Batch mein save hote hain.</li>
            </ol>
            <p className="mt-4 text-xs text-muted">Metadata cleanup privacy/clean-file ke liye hai; Pinterest ka AI detection/labeling guarantee ke saath disable nahi kiya ja sakta.</p>
          </div>

          {run && (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-accent font-medium">Run status</p>
              <h2 className="mt-1 font-semibold">{run.name}</h2>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-background p-3">Queued <b className="block text-base text-foreground">{queued}</b></div>
                <div className="rounded-lg bg-background p-3">Processing <b className="block text-base text-foreground">{processing}</b></div>
                <div className="rounded-lg bg-background p-3">Completed <b className="block text-base text-foreground">{completed}</b></div>
                <div className="rounded-lg bg-background p-3">Failed <b className="block text-base text-foreground">{failed}</b></div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full bg-accent transition-all" style={{ width: `${run.total ? Math.round((completed / run.total) * 100) : 0}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">{completed}/{run.total} Flow images complete</p>
              <div className="mt-4 max-h-72 space-y-2 overflow-auto">
                {jobs.map((job) => (
                  <div key={job.id} className="rounded-lg border border-border bg-background p-3">
                    <p className="truncate text-xs font-medium">{job.articleTitle}</p>
                    <p className="mt-1 text-[11px] text-muted">{job.styleLabel} · <span className={job.status === "failed" ? "text-red-300" : job.status === "completed" ? "text-emerald-300" : "text-muted"}>{job.status}</span></p>
                    {job.error && <p className="mt-1 text-[11px] text-red-300">{job.error}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
