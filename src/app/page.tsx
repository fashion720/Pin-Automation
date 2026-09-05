"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Post } from "@/lib/store";
import type { Batch } from "@/lib/batches";

export default function Home() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [newBatchAccount, setNewBatchAccount] = useState("");
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [availableModels, setAvailableModels] = useState<{ id: string; label: string }[]>([]);
  const [savingModel, setSavingModel] = useState(false);

  useEffect(() => {
    Promise.all([fetch("/api/posts").then((r) => r.json()), fetch("/api/batches").then((r) => r.json())])
      .then(([postData, batchData]) => {
        setPosts(postData);
        setBatches(batchData);
      })
      .catch(() => {
        setPosts([]);
        setBatches([]);
      });

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setGeminiModel(data.geminiModel || "");
        setAvailableModels(data.availableModels || []);
      })
      .catch(() => undefined);
  }, []);

  async function changeGeminiModel(model: string) {
    const previous = geminiModel;
    setGeminiModel(model); // optimistic
    setSavingModel(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": process.env.NEXT_PUBLIC_APP_API_SECRET || "",
        },
        body: JSON.stringify({ geminiModel: model }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Model change nahi hua");
    } catch {
      setGeminiModel(previous); // revert on failure
    } finally {
      setSavingModel(false);
    }
  }

  async function createBatch() {
    if (!newBatchName.trim()) return setBatchError("Batch ka naam do.");
    setCreatingBatch(true);
    setBatchError("");
    try {
      const response = await fetch("/api/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newBatchName, accountLabel: newBatchAccount }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Batch create nahi hua");
      setBatches((current) => [data, ...(current || [])]);
      setNewBatchName("");
      setNewBatchAccount("");
      setShowBatchForm(false);
    } catch (err: any) {
      setBatchError(err.message);
    } finally {
      setCreatingBatch(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Your batches</h1>
        <div className="flex items-center gap-4">
          {availableModels.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="gemini-model" className="text-xs text-muted whitespace-nowrap">Gemini model</label>
              <select
                id="gemini-model"
                value={geminiModel}
                onChange={(event) => changeGeminiModel(event.target.value)}
                disabled={savingModel}
                className="rounded-full border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-accent disabled:opacity-50"
              >
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          )}
          {posts && posts.length > 0 && (
            <>
              <span className="text-sm text-muted">
                {posts.length} post{posts.length > 1 ? "s" : ""} ·{" "}
                {posts.reduce((n, p) => n + p.pins.length, 0)} pins total
              </span>
              <Link href="/schedule" className="rounded-full bg-accent px-4 py-2 text-sm text-white transition hover:opacity-90">
                Schedule batch
              </Link>
            </>
          )}
        </div>
      </div>

      {posts === null && <p className="text-muted">Loading…</p>}

      {batches && batches.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">Organize by account</p>
              <h2 className="mt-1 text-xl font-semibold">Pick a batch to view its posts &amp; pins</h2>
            </div>
            <button onClick={() => setShowBatchForm((value) => !value)} className="rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-foreground">{showBatchForm ? "Cancel" : "+ Create new batch"}</button>
          </div>
          {showBatchForm && (
            <div className="mb-4 grid gap-3 rounded-2xl border border-accent/30 bg-surface p-4 sm:grid-cols-[1fr_1fr_auto]">
              <input value={newBatchName} onChange={(event) => setNewBatchName(event.target.value)} placeholder="e.g. Batch 2 · Fashion" className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />
              <input value={newBatchAccount} onChange={(event) => setNewBatchAccount(event.target.value)} placeholder="Pinterest account/category" className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />
              <button onClick={createBatch} disabled={creatingBatch} className="rounded-full bg-accent px-4 py-2.5 text-sm text-white transition hover:opacity-90 disabled:opacity-50">{creatingBatch ? "Creating…" : "Create batch"}</button>
              {batchError && <p className="text-xs text-accent sm:col-span-3">{batchError}</p>}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((batch) => (
              <Link key={batch.id} href={`/batches/${batch.id}`} className="group rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-lg text-accent">▦</div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] ${batch.status === "pins_created" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{batch.status === "pins_created" ? "Pins Created" : "Pending"}</span>
                </div>
                <h3 className="mt-5 line-clamp-1 text-lg font-medium group-hover:text-accent">{batch.name}</h3>
                <p className="mt-1 line-clamp-1 text-xs text-muted">{batch.accountLabel || "No account label"}</p>
                {batch.notes && (
                  <p className="mt-2 line-clamp-2 rounded-lg bg-accent/5 px-2.5 py-1.5 text-xs text-accent">📝 {batch.notes}</p>
                )}
                <div className="mt-5 flex gap-4 text-xs text-muted"><span>{(batch as Batch & { postCount?: number }).postCount || 0} posts</span><span>{(batch as Batch & { pinCount?: number }).pinCount || 0} pins</span></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {batches?.length === 0 && (
        <div className="border border-dashed border-border rounded-2xl py-24 flex flex-col items-center gap-4 text-center">
          <p className="text-muted max-w-sm">
            Abhi koi batch nahi bana. Ek article link do, teen pin templates
            se pehla batch bana lo.
          </p>
          <Link
            href="/create"
            className="bg-accent text-white px-5 py-2.5 rounded-full text-sm hover:opacity-90 transition"
          >
            + Create your first post
          </Link>
        </div>
      )}
    </div>
  );
}
