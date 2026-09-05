"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Post, Pin } from "@/lib/store";

interface PinRow extends Pin {
  postId: string;
  postTitle: string;
  articleUrl: string;
}

function localDateTime(hoursAhead = 1): string {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function SchedulePage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchSize, setBatchSize] = useState(6);
  const [startAt, setStartAt] = useState(localDateTime());
  const [sameArticleGapDays, setSameArticleGapDays] = useState(3);
  const [board, setBoard] = useState("");
  const [includeExtended, setIncludeExtended] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const pins = useMemo<PinRow[]>(
    () => posts?.flatMap((post) => post.pins.map((pin) => ({ ...pin, postId: post.id, postTitle: post.title, articleUrl: post.articleUrl }))) || [],
    [posts]
  );

  const selectedPins = useMemo(() => {
    const selected = new Set(selectedIds);
    return pins.filter((pin) => selected.has(pin.id));
  }, [pins, selectedIds]);

  const articleCount = new Set(selectedPins.map((pin) => pin.articleUrl || pin.postId)).size;
  const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  useEffect(() => {
    fetch("/api/posts")
      .then((response) => response.json())
      .then((data: Post[]) => {
        setPosts(data);
        setSelectedIds(data.flatMap((post) => post.pins).slice(0, 6).map((pin) => pin.id));
      })
      .catch(() => setPosts([]));
  }, []);

  function applyBatchSize(size: number) {
    setBatchSize(size);
    setSelectedIds(pins.slice(0, size).map((pin) => pin.id));
  }

  function togglePin(pinId: string) {
    setSelectedIds((current) => {
      if (current.includes(pinId)) return current.filter((id) => id !== pinId);
      if (current.length >= 10) return current;
      return [...current, pinId];
    });
  }

  async function downloadClaudeCsv() {
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/export");
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Data CSV export fail ho gaya");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename=\"?([^\";]+)\"?/i)?.[1] || "claude-pin-data.csv";
      downloadBlob(blob, filename);
      setSuccess("Saari pins ka data-rich CSV Claude ke liye download ho gaya.");
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function exportSchedule() {
    setError("");
    setSuccess("");
    if (selectedPins.length < 1) return setError("Kam se kam ek pin select karo.");
    if (selectedPins.length > 200) return setError("Pinterest ek CSV mein maximum 200 pins allow karta hai.");

    setLoading(true);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "pinterest",
          pinIds: selectedIds,
          startAt: new Date(startAt).toISOString(),
          sameArticleGapDays,
          timeZone,
          board,
          includeExtended,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "CSV export fail ho gaya");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "pinterest-pins.csv";
      downloadBlob(blob, filename);
      setSuccess(`${selectedPins.length} pins schedule ho gayi hain aur CSV download ho gayi.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted transition hover:text-foreground">← Posts</Link>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-accent">Pinterest publishing queue</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Schedule your pin batch</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Pins select karo, publish rhythm set karo, aur Pinterest Bulk Create ke liye ready CSV download karo. Same article ke pins automatically gap ke saath spread honge; different articles same date par aa sakte hain.</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Selected</p>
          <p className="mt-1 text-2xl font-semibold text-accent">{selectedPins.length}<span className="text-sm text-muted"> / 10</span></p>
          <p className="text-xs text-muted">{articleCount} article{articleCount === 1 ? "" : "s"}</p>
        </div>
      </div>

      {posts?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center">
          <p className="text-muted">Pehle kuch pins generate karo.</p>
          <Link href="/create" className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-sm text-white">+ Create pins</Link>
        </div>
      )}

      {posts && posts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Choose pins</h2>
                <p className="mt-1 text-xs text-muted">Start 6 se karo; batch ko 10 pins tak scale kar sakte ho.</p>
              </div>
              <div className="flex rounded-full border border-border bg-surface p-1">
                {[6, 7, 8, 9, 10].map((size) => (
                  <button key={size} onClick={() => applyBatchSize(size)} className={`rounded-full px-3 py-1.5 text-xs transition ${batchSize === size ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {pins.map((pin) => {
                const selected = selectedIds.includes(pin.id);
                return (
                  <button key={pin.id} type="button" onClick={() => togglePin(pin.id)} className={`overflow-hidden rounded-xl border text-left transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? "border-accent ring-2 ring-accent/20" : "border-border"}`}>
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pin.imageUrl} alt={pin.altText || pin.overlayText} className="aspect-[2/3] w-full object-cover" />
                      <span className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${selected ? "bg-accent text-white" : "bg-black/60 text-white"}`}>{selected ? "✓" : ""}</span>
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-1 text-xs font-medium">{pin.pinTitle || pin.overlayText}</p>
                      <p className="mt-1 line-clamp-1 text-[11px] text-muted">{pin.postTitle}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-accent">{pin.templateName}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-6">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">Schedule settings</p>
            <h2 className="mt-2 text-xl font-semibold">Publish rhythm</h2>
            <p className="mt-1 text-xs leading-5 text-muted">Same article ke selected pins ko ek hi din publish nahi kiya jayega.</p>

            <label className="mt-6 block text-sm font-medium">First publish date & time</label>
            <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />
            <p className="mt-1 text-[11px] text-muted">Timezone: {timeZone}</p>

            <label className="mt-5 block text-sm font-medium">Gap for same article</label>
            <div className="mt-2 flex items-center gap-3">
              <input type="number" min={1} max={30} value={sameArticleGapDays} onChange={(event) => setSameArticleGapDays(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} className="w-24 rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />
              <span className="text-sm text-muted">days between pins</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">Example: 3 pins from one article = day 1, day {1 + sameArticleGapDays}, day {1 + sameArticleGapDays * 2}.</p>

            <label className="mt-5 block text-sm font-medium">Pinterest board <span className="font-normal text-muted">(optional)</span></label>
            <input value={board} onChange={(event) => setBoard(event.target.value)} placeholder="e.g. Summer Outfit Ideas" className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />

            <label className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-background/60 p-3 text-xs text-muted">
              <input type="checkbox" checked={includeExtended} onChange={(event) => setIncludeExtended(event.target.checked)} className="mt-0.5 accent-accent" />
              <span><strong className="text-foreground">Include extended metadata</strong><br />Tags, alt text, overlay, template, article URL aur timezone columns bhi add honge. Agar Pinterest strict columns maange to isay off kar do.</span>
            </label>

            <div className="mt-5 rounded-xl bg-background px-4 py-3 text-xs leading-5 text-muted">
              <span className="font-medium text-foreground">CSV preview:</span> Title, Media URL, Pinterest board, Description, Link, Publish date{includeExtended ? ", Tags, Alt text" : ""}
            </div>

            {error && <p className="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent">{error}</p>}
            {success && <p className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">{success}</p>}

            <button onClick={exportSchedule} disabled={loading || selectedPins.length === 0} className="mt-5 w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "Preparing CSV…" : `Schedule Pinterest CSV · ${selectedPins.length} pins`}
            </button>
            <button onClick={downloadClaudeCsv} disabled={loading} className="mt-3 w-full rounded-full border border-border px-5 py-3 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground disabled:opacity-50">
              Download all pin data for Claude
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
