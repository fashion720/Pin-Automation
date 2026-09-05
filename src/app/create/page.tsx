"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Post } from "@/lib/store";
import type { Batch } from "@/lib/batches";
import type { TemplateDef } from "@/lib/templates";

type TemplateRow = TemplateDef & { isCustom: boolean };
type Mode = "generate" | "manual";
type GenerationScope = "single" | "bulk";

interface ManualPin {
  file: File;
  previewUrl: string;
  overlayText: string;
}

async function uploadToR2(file: File): Promise<string> {
  const presignRes = await fetch("/api/upload-presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "pins-manual", contentType: file.type }),
  });
  const presignText = await presignRes.text();
  const presignData = presignText ? JSON.parse(presignText) : {};
  if (!presignRes.ok) throw new Error(presignData.error || "Upload URL nahi mila");

  const putRes = await fetch(presignData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("R2 upload fail ho gaya");

  return presignData.publicUrl as string;
}

export default function CreatePost() {
  const [mode, setMode] = useState<Mode>("generate");

  // --- Generate-from-template mode state ---
  const [articleUrl, setArticleUrl] = useState("");
  const [generationScope, setGenerationScope] = useState<GenerationScope>("single");
  const [articleUrls, setArticleUrls] = useState("");
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [bulkSummary, setBulkSummary] = useState("");
  const [keywords, setKeywords] = useState("");
  const [annotations, setAnnotations] = useState("");
  const [siteText, setSiteText] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [selectedLayouts, setSelectedLayouts] = useState<string[]>([]);
  const [templateFilter, setTemplateFilter] = useState("all");
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [newBatchAccount, setNewBatchAccount] = useState("");

  // --- Manual upload mode state ---
  const [manualTitle, setManualTitle] = useState("");
  const [manualArticleUrl, setManualArticleUrl] = useState("");
  const [manualKeywords, setManualKeywords] = useState("");
  const [manualPins, setManualPins] = useState<ManualPin[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Post | null>(null);

  useEffect(() => {
    fetch("/api/batches")
      .then((r) => r.json())
      .then((data: Batch[]) => setBatches(data))
      .catch(() => setBatches([]));
  }, []);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then((data: TemplateRow[]) => {
        setTemplates(data);
        // Default: koi template pre-selected nahi — user manually apni pasand ke templates chunta hai.
        setSelectedLayouts([]);
      })
      .catch(() => setTemplates([]));
  }, []);

  async function createBatch() {
    if (!newBatchName.trim()) return setError("Batch ka naam do.");
    try {
      const response = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBatchName, accountLabel: newBatchAccount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Batch create nahi hua");
      setBatches((current) => [data, ...(current || [])]);
      setSelectedBatchId(data.id);
      setNewBatchName("");
      setNewBatchAccount("");
      setShowNewBatch(false);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  function toggleLayout(id: string) {
    setSelectedLayouts((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  function selectAllVisibleLayouts() {
    setSelectedLayouts((prev) => {
      const visibleIds = filteredTemplates.map((t) => t.id);
      const merged = new Set([...prev, ...visibleIds]);
      return Array.from(merged);
    });
  }

  function deselectAllLayouts() {
    setSelectedLayouts([]);
  }

  function addManualFiles(files: FileList) {
    const next: ManualPin[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      overlayText: "",
    }));
    setManualPins((prev) => [...prev, ...next]);
  }

  function removeManualPin(i: number) {
    setManualPins((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateManualOverlay(i: number, text: string) {
    setManualPins((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, overlayText: text } : p))
    );
  }

  async function generateOneWithRetry(url: string): Promise<void> {
    const maxAttempts = 4;
    const baseDelayMs = 8000; // 8s, 16s, 32s backoff on 429

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": process.env.NEXT_PUBLIC_APP_API_SECRET || "",
        },
        body: JSON.stringify({ articleUrl: url, keywords, annotations, siteText, layoutIds: selectedLayouts, batchId: selectedBatchId }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};

      const isRateLimited = res.status === 429 || /429|too many requests/i.test(data.error || "");

      if (res.ok) return;

      if (isRateLimited && attempt < maxAttempts) {
        const waitMs = baseDelayMs * Math.pow(2, attempt - 1);
        setBulkSummary(`Rate limited (429) — ${url} ko ${Math.round(waitMs / 1000)}s baad retry kar raha hoon (attempt ${attempt}/${maxAttempts})…`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw new Error(data.error || "Generate fail ho gaya");
    }
  }

  async function handleBulkGenerate() {
    setError("");
    setResult(null);
    setBulkSummary("");
    const urls = Array.from(new Set(articleUrls.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean)));
    if (urls.length === 0) return setError("Kam se kam ek article URL daalo.");
    if (urls.length > 50) return setError("Ek batch mein maximum 50 article URLs allowed hain.");
    if (selectedLayouts.length === 0) return setError("Kam se kam ek template select karo.");
    if (!selectedBatchId) return setError("Bulk generation ke liye pehle batch select karo.");

    setLoading(true);
    setBulkProgress({ done: 0, total: urls.length });
    const failures: string[] = [];
    let created = 0;
    const gapBetweenRequestsMs = 4000; // same-blog burst se bachne ke liye gap
    try {
      for (const [index, url] of urls.entries()) {
        try {
          await generateOneWithRetry(url);
          created++;
        } catch (err: any) {
          failures.push(`${url}: ${err.message}`);
        } finally {
          setBulkProgress({ done: index + 1, total: urls.length });
        }
        if (index < urls.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, gapBetweenRequestsMs));
        }
      }
      setBulkSummary(`${created} posts created · ${created * selectedLayouts.length} pins planned${failures.length ? ` · ${failures.length} failed` : ""}`);
      if (failures.length) setError(failures.join("\\n"));
      setArticleUrls("");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setError("");
    setResult(null);
      if (!articleUrl.trim()) return setError("Article ka link daalo pehle.");
      if (!selectedBatchId) return setError("Pehle ek batch select karo (ya naya batch bana lo), taake ye post kisi batch se bahar na rahe.");

    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": process.env.NEXT_PUBLIC_APP_API_SECRET || "",
        },
        body: JSON.stringify({
          articleUrl,
          keywords,
          annotations,
          siteText,
          layoutIds: selectedLayouts,
          batchId: selectedBatchId || undefined,
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || "Generate fail ho gaya");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredTemplates = (templates || []).filter((template) => {
    if (templateFilter === "all") return true;
    if (templateFilter === "three") return template.imageCount === 3;
    if (templateFilter === "single") return template.imageCount === 1;
    return template.category === templateFilter;
  });

  const templateCategories = Array.from(new Set((templates || []).map((template) => template.category || "General")));

  async function handleManualSave() {
    setError("");
    setResult(null);
    if (!manualTitle.trim()) return setError("Post ka title do.");
    if (manualPins.length === 0) return setError("Kam se kam ek pin image upload karo.");
    if (!selectedBatchId) return setError("Pehle ek batch select karo (ya naya batch bana lo), taake ye post kisi batch se bahar na rahe.");

    setLoading(true);
    try {
      const uploaded = [];
      for (const pin of manualPins) {
        const imageUrl = await uploadToR2(pin.file);
        uploaded.push({ imageUrl, overlayText: pin.overlayText, keywords: manualKeywords });
      }

      const res = await fetch("/api/posts/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: manualTitle,
          articleUrl: manualArticleUrl,
          batchId: selectedBatchId || undefined,
          pins: uploaded,
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || "Save fail ho gaya");
      setResult(data);
      setManualPins([]);
      setManualTitle("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Create a post</h1>
      <p className="text-muted text-sm mb-6">
        Sirf article URL do — article ki images aur context se multiple Pinterest designs, overlays aur CTAs automatically banenge.
      </p>

      <div className="inline-flex rounded-full border border-border p-1 mb-8">
        <button
          onClick={() => setMode("generate")}
          className={`text-sm px-4 py-1.5 rounded-full transition ${
            mode === "generate" ? "bg-accent text-white" : "text-muted"
          }`}
        >
          Generate from template
        </button>
        <button
          onClick={() => setMode("manual")}
          className={`text-sm px-4 py-1.5 rounded-full transition ${
            mode === "manual" ? "bg-accent text-white" : "text-muted"
          }`}
        >
          Upload my own pins
        </button>
      </div>

      <div className="mb-8 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <label className="block text-sm font-medium">Save in batch</label>
            <p className="mt-1 text-xs text-muted">Home Decor aur Fashion jaisi categories/accounts ko alag rakho.</p>
            <select value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)} className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent">
              <option value="">Unsorted (default)</option>
              {batches?.map((batch) => <option key={batch.id} value={batch.id} disabled={batch.status !== "pending"}>{batch.name}{batch.accountLabel ? ` · ${batch.accountLabel}` : ""}{batch.status !== "pending" ? ` · ${batch.status}` : ""}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => setShowNewBatch((value) => !value)} className="rounded-full border border-border px-4 py-2.5 text-sm text-muted transition hover:border-accent hover:text-foreground">
            {showNewBatch ? "Cancel" : "+ New batch"}
          </button>
        </div>
        {showNewBatch && (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-[1fr_1fr_auto]">
            <input value={newBatchName} onChange={(event) => setNewBatchName(event.target.value)} placeholder="e.g. Fashion · Summer 2026" className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />
            <input value={newBatchAccount} onChange={(event) => setNewBatchAccount(event.target.value)} placeholder="Account/category e.g. Fashion" className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent" />
            <button type="button" onClick={createBatch} className="rounded-full bg-accent px-4 py-2.5 text-sm text-white transition hover:opacity-90">Create batch</button>
          </div>
        )}
      </div>

      {mode === "generate" && (
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-border bg-surface p-1">
            <button type="button" onClick={() => setGenerationScope("single")} className={`rounded-full px-4 py-2 text-sm transition ${generationScope === "single" ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>Single article</button>
            <button type="button" onClick={() => setGenerationScope("bulk")} className={`rounded-full px-4 py-2 text-sm transition ${generationScope === "bulk" ? "bg-accent text-white" : "text-muted hover:text-foreground"}`}>Bulk batch</button>
          </div>

          {generationScope === "single" ? (
            <div>
              <label className="block text-sm font-medium mb-2">Article link</label>
              <input
                type="url"
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                placeholder="https://outfitedits.com/posts/..."
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent transition"
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">Article links for this batch</label>
              <p className="mb-3 text-xs text-muted">Har line mein ek URL paste karo. Selected templates ki pins banengi, aur har article par layout / palette order automatically rotate hoga taake batch generic na lage.</p>
              <textarea
                value={articleUrls}
                onChange={(e) => setArticleUrls(e.target.value)}
                rows={8}
                placeholder={`https://example.com/article-one\nhttps://example.com/article-two\nhttps://example.com/article-three`}
                className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none transition focus:border-accent"
              />
              <p className="mt-2 text-xs text-muted">{Array.from(new Set(articleUrls.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean))).length} unique URLs · maximum 50 per batch</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium mb-2">
                Website / Brand text
              </label>
              <input
                type="text"
                value={siteText}
                onChange={(e) => setSiteText(e.target.value)}
                placeholder="e.g. Fashion720.com"
                maxLength={80}
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent transition"
              />
              <p className="mt-1.5 text-xs text-muted">Har generated pin ke bottom par professional brand text ke taur par show hoga.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Keywords <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="diy, summer outfit"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Annotations <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={annotations}
                onChange={(e) => setAnnotations(e.target.value)}
                placeholder="Extra tone/notes for the overlay text"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium">Pin designs <span className="text-muted font-normal">({selectedLayouts.length} selected)</span></label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={selectAllVisibleLayouts} className="text-xs text-accent hover:underline">
                  Select all
                </button>
                <button type="button" onClick={deselectAllLayouts} className="text-xs text-muted hover:underline">
                  Deselect all
                </button>
                <Link href="/templates/new" className="text-xs text-accent hover:underline">
                  + Add a new template
                </Link>
              </div>
            </div>

            <p className="text-xs text-muted mb-3">
              Har selected article par selected designs ki ek-ek pin banegi. 14 editorial systems available hain; har template 1–4 article images use karta hai, aur bulk URLs par template order + controlled typography/banner variants deterministic tareeqe se rotate hote hain.
            </p>

            {templates?.length === 0 && (
              <p className="text-sm text-muted">
                Koi template nahi mila.{" "}
                <Link href="/templates/new" className="text-accent hover:underline">
                  Pehla template banao
                </Link>
                .
              </p>
            )}

            <div className="mb-4 flex flex-wrap gap-2">
              {[{ value: "all", label: "All templates" }, { value: "three", label: "3 images" }, { value: "single", label: "1 image" }, ...templateCategories.map((category) => ({ value: category, label: category }))].map((filter) => (
                <button key={filter.value} type="button" onClick={() => setTemplateFilter(filter.value)} className={`rounded-full border px-3 py-1.5 text-xs transition ${templateFilter === filter.value ? "border-accent bg-accent text-white" : "border-border text-muted hover:border-accent hover:text-foreground"}`}>
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {filteredTemplates.map((t) => {
                const active = selectedLayouts.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleLayout(t.id)}
                    className={`relative text-left rounded-xl border p-3 transition ${active ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-muted"}`}
                  >
                    <span className={`absolute right-5 top-5 flex h-6 w-6 items-center justify-center rounded-full border text-xs ${active ? "border-accent bg-accent text-white" : "border-white/60 bg-black/20 text-white"}`}>
                      {active ? "✓" : ""}
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.backgroundFile} alt={t.selectionLabel || t.name} className="aspect-[2/3] rounded-lg object-cover w-full mb-3 bg-border" />
                    <p className="text-sm font-medium leading-tight">{t.selectionLabel || t.name}</p>
                    <p className="mt-1 text-xs text-muted">{t.category || "General"} · {`${t.imageCount} image${t.imageCount !== 1 ? "s" : ""}`}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={generationScope === "bulk" ? handleBulkGenerate : handleGenerate}
            disabled={loading}
            className="bg-accent text-white px-6 py-3 rounded-full text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? generationScope === "bulk" ? `Creating posts… ${bulkProgress.done}/${bulkProgress.total}` : "Generating all designs…" : generationScope === "bulk" ? `Create ${selectedLayouts.length} pins per article` : "Create premium Pinterest pins"}
          </button>
          {bulkSummary && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{bulkSummary}</div>}
        </div>
      )}

      {mode === "manual" && (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Post title</label>
            <input
              type="text"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="e.g. Human Anatomy — Head & Neck"
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Destination link <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={manualArticleUrl}
                onChange={(e) => setManualArticleUrl(e.target.value)}
                placeholder="https://..."
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Keywords <span className="text-muted font-normal">(optional, sab pins ke liye)</span>
              </label>
              <input
                type="text"
                value={manualKeywords}
                onChange={(e) => setManualKeywords(e.target.value)}
                placeholder="diy, summer outfit"
                className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Pin images</label>
            <label className="block border border-dashed border-border rounded-xl py-10 text-center cursor-pointer hover:border-accent/50 transition">
              <input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && addManualFiles(e.target.files)}
              />
              <span className="text-muted text-sm">
                Click karke apni finished pin images chuno (ek se zyada bhi)
              </span>
            </label>

            {manualPins.length > 0 && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                {manualPins.map((p, i) => (
                  <div key={i} className="rounded-xl overflow-hidden border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.previewUrl} alt="" className="w-full aspect-[2/3] object-cover" />
                    <div className="p-2 space-y-2">
                      <input
                        type="text"
                        placeholder="Overlay text (optional, sirf CSV ke liye)"
                        value={p.overlayText}
                        onChange={(e) => updateManualOverlay(i, e.target.value)}
                        className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs outline-none focus:border-accent transition"
                      />
                      <button
                        onClick={() => removeManualPin(i)}
                        className="text-xs text-accent hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleManualSave}
            disabled={loading}
            className="bg-accent text-white px-6 py-3 rounded-full text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "Uploading…" : "Save this post"}
          </button>
        </div>
      )}

      {error && (
                  <p className="whitespace-pre-line text-sm text-accent bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 mt-6">

          {error}
        </p>
      )}

      {result && (
        <div className="mt-12">
          <h2 className="font-medium mb-4">{result.title}</h2>
          <div className="grid grid-cols-3 gap-4">
            {result.pins.map((pin) => (
              <div key={pin.id} className="rounded-xl overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pin.imageUrl} alt={pin.overlayText} className="w-full aspect-[2/3] object-cover" />
                <div className="p-3">
                  <p className="text-xs text-muted">{pin.templateName}</p>
                  <p className="text-sm mt-1">{pin.overlayText}</p>
                </div>
              </div>
            ))}
          </div>
          <a href="/" className="inline-block mt-6 text-sm text-accent hover:underline">
            ← Sab posts dekho
          </a>
        </div>
      )}
    </div>
  );
}
