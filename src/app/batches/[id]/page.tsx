"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Batch } from "@/lib/batches";
import type { Post } from "@/lib/store";

interface BatchPayload {
  batch: Batch;
  posts: Post[];
  postCount: number;
  pinCount: number;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [payload, setPayload] = useState<BatchPayload | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [targetBatchId, setTargetBatchId] = useState("");
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<string>("");

  useEffect(() => {
    params.then(({ id }) => fetch(`/api/batches/${id}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Batch load nahi hua");
      setPayload(data);
      setNotesDraft(data.batch?.notes || "");
      fetch("/api/batches").then((batchResponse) => batchResponse.json()).then((batchData) => { if (Array.isArray(batchData)) setBatches(batchData); }).catch(() => undefined);
    }).catch((err) => setError(err.message)));
  }, [params]);

  function togglePost(postId: string) {
    setSelectedPostIds((current) => current.includes(postId) ? current.filter((id) => id !== postId) : [...current, postId]);
  }

  function toggleAllPosts() {
    setSelectedPostIds((current) => current.length === payload?.posts.length ? [] : (payload?.posts || []).map((post) => post.id));
  }

  async function runBulkAction(action: "delete" | "move") {
    if (!payload || selectedPostIds.length === 0) return;
    if (action === "delete" && !window.confirm(`Kya aap ${selectedPostIds.length} selected post${selectedPostIds.length === 1 ? "" : "s"} delete karna chahte ho?`)) return;
    if (action === "move" && !targetBatchId) return setBulkMessage("Pehle target batch select karo.");
    setBulkActionLoading(true);
    setBulkMessage("");
    try {
      const response = await fetch(`/api/batches/${payload.batch.id}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, postIds: selectedPostIds, targetBatchId: action === "move" ? targetBatchId : undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Bulk action fail ho gaya");
      setPayload((current) => {
        if (!current) return current;
        const removedPins = current.posts.filter((post) => selectedPostIds.includes(post.id)).reduce((sum, post) => sum + post.pins.length, 0);
        return { ...current, posts: current.posts.filter((post) => !selectedPostIds.includes(post.id)), postCount: current.postCount - data.count, pinCount: current.pinCount - removedPins };
      });
      setSelectedPostIds([]);
      setTargetBatchId("");
      setBulkMessage(action === "delete" ? `${data.count} post${data.count === 1 ? "" : "s"} deleted.` : `${data.count} post${data.count === 1 ? "" : "s"} moved.`);
    } catch (err: any) {
      setBulkMessage(err.message);
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function downloadBatchCsv() {
    if (!payload) return;
    setDownloading(true);
    setError("");
    try {
      const query = new URLSearchParams({ batchId: payload.batch.id });
      if (selectedPostIds.length > 0) query.set("postIds", selectedPostIds.join(","));
      const response = await fetch(`/api/export?${query.toString()}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Batch CSV export fail ho gaya");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename=\"?([^\";]+)\"?/i)?.[1] || `${payload.batch.name}-claude-data.csv`;
      downloadBlob(blob, filename);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  if (error) return <div className="mx-auto max-w-4xl px-6 py-16"><p className="text-accent">{error}</p><Link href="/" className="mt-4 inline-block text-sm text-muted hover:text-foreground">← Back to posts</Link></div>;
  if (!payload) return <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-muted">Loading batch…</div>;
  const currentBatchId = payload.batch.id;
  const allPostsSelected = payload.posts.length > 0 && selectedPostIds.length === payload.posts.length;

  async function updateStatus(status: "pending" | "pins_created") {
    setUpdatingStatus(true);
    setError("");
    try {
      const response = await fetch(`/api/batches/${currentBatchId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Status update nahi hua");
      setPayload((current) => current ? { ...current, batch: data } : current);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function saveNotes() {
    if (!payload) return;
    setSavingNotes(true);
    setError("");
    try {
      const response = await fetch(`/api/batches/${currentBatchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Notes save nahi huay");
      setPayload((current) => (current ? { ...current, batch: data } : current));
      setNotesSavedAt(new Date().toLocaleTimeString());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingNotes(false);
    }
  }

  async function deleteCurrentBatch() {
    if (!payload) return;
    if (!window.confirm(`Kya aap ${payload.batch.name} aur iski ${payload.postCount} posts delete karna chahte ho?`)) return;
    setDeletingBatch(true);
    setError("");
    try {
      const response = await fetch(`/api/batches/${currentBatchId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Batch delete nahi hua");
      router.push("/");
    } catch (err: any) {
      setError(err.message);
      setDeletingBatch(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-sm text-muted transition hover:text-foreground">← All batches</Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">Batch folder</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{payload.batch.name}</h1>
          <p className="mt-2 text-sm text-muted">{payload.batch.accountLabel || "No account/category label"}{payload.batch.description ? ` · ${payload.batch.description}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-right text-xs text-muted"><strong className="text-foreground">{payload.postCount}</strong> posts · <strong className="text-foreground">{payload.pinCount}</strong> pins</div>
          <select aria-label="Batch status" value={payload.batch.status} onChange={(event) => updateStatus(event.target.value as "pending" | "pins_created")} disabled={updatingStatus} className={`rounded-full border px-4 py-3 text-sm outline-none ${payload.batch.status === "pins_created" ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-amber-400/40 bg-amber-400/10 text-amber-200"}`}>
            <option value="pending">Pending</option>
            <option value="pins_created">Pins Created</option>
          </select>
          <button onClick={downloadBatchCsv} disabled={downloading || payload.pinCount === 0} className="rounded-full bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            {downloading ? "Preparing CSV…" : selectedPostIds.length > 0 ? `Download ${selectedPostIds.length} selected` : "Download all batch posts"}
          </button>
          <button onClick={deleteCurrentBatch} disabled={deletingBatch} className="rounded-full border border-red-400/40 px-4 py-3 text-sm text-red-300 transition hover:bg-red-400/10 disabled:opacity-50">{deletingBatch ? "Deleting…" : "Delete batch"}</button>
        </div>
      </div>

      {payload.batch.status === "pins_created" && <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">Pins Created — is batch ki pins aap process kar chuke ho. Posts aur pins ko aap kisi bhi waqt delete kar sakte ho.</div>}
      {payload.batch.status === "pending" && <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"><span>Pending — is batch ki pins abhi process karni hain.</span><button onClick={() => updateStatus("pins_created")} disabled={updatingStatus} className="rounded-full bg-amber-300 px-4 py-2 text-xs font-medium text-black transition hover:bg-amber-200 disabled:opacity-50">{updatingStatus ? "Saving…" : "Mark Pins Created"}</button></div>}

      <div className="mt-6 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="batch-notes" className="text-sm font-medium">Notes <span className="font-normal text-muted">(e.g. schedule reminder — "14 Sep tak publish ho jaein gi")</span></label>
          {notesSavedAt && !savingNotes && <span className="text-xs text-muted">Saved {notesSavedAt}</span>}
        </div>
        <textarea
          id="batch-notes"
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          placeholder="Is batch ke baare mein reminder likho — jaise publish date, schedule status, ya koi aur note…"
          rows={3}
          maxLength={2000}
          className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-muted">{notesDraft.length}/2000</span>
          <button
            onClick={saveNotes}
            disabled={savingNotes || notesDraft === (payload.batch.notes || "")}
            className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {savingNotes ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={allPostsSelected} onChange={toggleAllPosts} className="h-4 w-4 accent-[var(--accent)]" />
          Select all posts
        </label>
        <p className="text-xs text-muted">{selectedPostIds.length > 0 ? `${selectedPostIds.length} post${selectedPostIds.length === 1 ? "" : "s"} selected` : "No post selected — entire batch will export"}</p>
      </div>

      {selectedPostIds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <span className="text-sm font-medium">Bulk actions</span>
          <select value={targetBatchId} onChange={(event) => setTargetBatchId(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="">Move selected to…</option>
            {batches.filter((batch) => batch.id !== currentBatchId).map((batch) => <option key={batch.id} value={batch.id}>{batch.name}{batch.accountLabel ? ` · ${batch.accountLabel}` : ""}</option>)}
          </select>
          <button onClick={() => runBulkAction("move")} disabled={bulkActionLoading || !targetBatchId} className="rounded-full border border-accent px-4 py-2 text-sm text-accent transition hover:bg-accent/10 disabled:opacity-50">{bulkActionLoading ? "Working…" : "Move selected"}</button>
          <button onClick={() => runBulkAction("delete")} disabled={bulkActionLoading} className="rounded-full border border-red-400/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-400/10 disabled:opacity-50">Delete selected</button>
          <Link href="/" className="text-xs text-muted hover:text-foreground">Need another folder? Create it from dashboard.</Link>
        </div>
      )}

      {bulkMessage && <p className="mt-3 text-sm text-muted">{bulkMessage}</p>}

      <div className="mt-5 space-y-6">
        {payload.posts.map((post) => (
          <section key={post.id} className={`rounded-2xl border bg-surface p-5 transition ${selectedPostIds.includes(post.id) ? "border-accent/70 shadow-[0_0_0_1px_rgba(227,87,111,0.2)]" : "border-border"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" aria-label={`Select ${post.title}`} checked={selectedPostIds.includes(post.id)} onChange={() => togglePost(post.id)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                <div><h2 className="text-lg font-medium">{post.title}</h2><p className="mt-1 text-xs text-muted">{post.pins.length} pins · {post.articleUrl || "No destination link"}</p></div>
              </div>
              <Link href={`/posts/${post.id}`} className="text-sm text-accent hover:underline">Open post</Link>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {post.pins.map((pin) => <Link key={pin.id} href={`/posts/${post.id}`} className="overflow-hidden rounded-lg border border-border transition hover:border-accent"><img src={pin.imageUrl} alt={pin.altText || pin.overlayText} className="aspect-[2/3] w-full object-cover" /></Link>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
