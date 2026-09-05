"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { Post, Pin } from "@/lib/store";
import type { PinStyleFontFamily, PinStyleOverrides } from "@/lib/pinStyle";

const FONT_OPTIONS: Array<{ value: PinStyleFontFamily; label: string }> = [
  { value: "sans", label: "Poppins · Clean sans" },
  { value: "display", label: "Oswald · Condensed display" },
  { value: "serif", label: "DM Serif · Editorial serif" },
];

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-muted">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-background p-0.5"
        />
        <span className="w-16 font-mono text-[11px] text-foreground">{value}</span>
      </span>
    </label>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-foreground">{value}{suffix || ""}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}

export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePin, setActivePin] = useState<Pin | null>(null);
  const [editText, setEditText] = useState("");
  const [editStyle, setEditStyle] = useState<PinStyleOverrides>({});
  const [saving, setSaving] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);

  function load() {
    fetch(`/api/posts/${id}`)
      .then((response) => response.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setPost(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  function openPin(pin: Pin) {
    setActivePin(pin);
    setEditText(pin.overlayText);
    setEditStyle(pin.styleOverrides || {});
  }

  function updateStyle<K extends keyof PinStyleOverrides>(key: K, value: PinStyleOverrides[K]) {
    setEditStyle((current) => ({ ...current, [key]: value }));
  }

  function setReadableContrast() {
    setEditStyle((current) => ({
      ...current,
      headlineColor: "#ffffff",
      headlineBackgroundColor: "#111111",
      headlineBackgroundOpacity: 0.9,
      headlineShadow: true,
    }));
  }

  async function handleSaveEdit() {
    if (!activePin) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${id}/pins/${activePin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overlayText: editText, styleOverrides: editStyle }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || "Update fail ho gaya");
      setPost(data);
      const updatedPin = data.pins.find((p: Pin) => p.id === activePin.id);
      setActivePin(updatedPin || null);
      if (updatedPin) {
        setEditText(updatedPin.overlayText);
        setEditStyle(updatedPin.styleOverrides || {});
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePin() {
    if (!activePin) return;
    if (!confirm("Ye pin delete karni hai?")) return;
    try {
      const res = await fetch(`/api/posts/${id}/pins/${activePin.id}`, { method: "DELETE" });
      const data = await res.json();
      setPost(data);
      setActivePin(null);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleDeletePost() {
    if (!confirm("Poori post (sab pins ke saath) delete karni hai? Ye wapas nahi ho sakta.")) return;
    setDeletingPost(true);
    try {
      await fetch(`/api/posts/${id}`, { method: "DELETE" });
      router.push("/");
    } catch (e: any) {
      alert(e.message);
      setDeletingPost(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-5xl px-6 py-10 text-muted">Loading…</div>;
  if (error || !post)
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-accent">{error || "Post nahi mili"}</p>
        <Link href="/" className="text-sm text-accent hover:underline">← Wapas jao</Link>
      </div>
    );

  const isManual = activePin?.templateId === "manual";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-sm text-muted transition hover:text-foreground">← Sab posts</Link>

      <div className="mt-3 mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{post.title}</h1>
          {post.articleUrl && (
            <a href={post.articleUrl} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-accent hover:underline">
              {post.articleUrl}
            </a>
          )}
          <p className="mt-1 text-xs text-muted">
            {post.pins.length} pins · {new Date(post.createdAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleDeletePost}
          disabled={deletingPost}
          className="whitespace-nowrap rounded-full border border-accent/40 px-4 py-2 text-sm text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {deletingPost ? "Deleting…" : "Delete post"}
        </button>
      </div>

      {post.pins.length === 0 && <p className="text-muted">Is post mein koi pin nahi bachi.</p>}

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {post.pins.map((pin) => (
          <button
            key={pin.id}
            onClick={() => openPin(pin)}
            className="overflow-hidden rounded-xl border border-border text-left transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pin.imageUrl} alt={pin.overlayText} className="aspect-[2/3] w-full object-cover" />
            <div className="p-3">
              <p className="text-xs text-muted">{pin.templateName}</p>
              <p className="mt-1 line-clamp-2 text-sm">{pin.overlayText}</p>
              {pin.styleOverrides && <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-accent">Custom style saved</p>}
            </div>
          </button>
        ))}
      </div>

      {activePin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6" onClick={() => setActivePin(null)}>
          <div
            className="flex min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]"
            style={{ height: "min(94dvh, 920px)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-[34dvh] min-h-[220px] shrink-0 items-center justify-center overflow-y-auto overscroll-contain bg-black/30 p-3 sm:p-6 lg:h-auto lg:min-h-0 lg:shrink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activePin.imageUrl} alt={activePin.overlayText} className="h-auto w-full max-w-xl object-contain lg:h-full lg:w-auto lg:max-h-[78vh]" />
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:h-auto">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7" style={{ scrollbarGutter: "stable" }}>
                <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">Pin editor</p>
                  <p className="mt-1 text-sm font-medium">{activePin.templateName}</p>
                  <p className="mt-1 text-xs text-muted">Changes regenerate this pin with the original article images.</p>
                </div>
                <button onClick={() => setActivePin(null)} className="text-xl leading-none text-muted hover:text-foreground" aria-label="Close editor">×</button>
              </div>

              <label className="mt-6 block text-sm font-medium">Overlay text</label>
              <textarea
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                rows={3}
                className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent"
              />

              {isManual ? (
                <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted">
                  Ye manually uploaded pin hai. Text/metadata save ho jayega, lekin image ko regenerate karne ke liye source article images available nahi hain.
                </p>
              ) : (
                <>
                  <div className="mt-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Headline styling</p>
                      <p className="mt-0.5 text-xs text-muted">Contrast aur hierarchy ko manually tune karo.</p>
                    </div>
                    <button onClick={setReadableContrast} className="rounded-full border border-accent/40 px-3 py-1.5 text-[11px] font-medium text-accent transition hover:bg-accent/10">
                      Improve contrast
                    </button>
                  </div>

                  <div className="mt-4 space-y-4 rounded-xl border border-border bg-background/60 p-4">
                    <label className="block text-xs text-muted">
                      <span className="mb-1.5 block">Headline font</span>
                      <select
                        value={editStyle.headlineFontFamily || "sans"}
                        onChange={(event) => updateStyle("headlineFontFamily", event.target.value as PinStyleFontFamily)}
                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                      >
                        {FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                      <ColorControl label="Text color" value={editStyle.headlineColor || "#ffffff"} onChange={(value) => updateStyle("headlineColor", value)} />
                      <ColorControl label="Panel color" value={editStyle.headlineBackgroundColor || "#111111"} onChange={(value) => updateStyle("headlineBackgroundColor", value)} />
                    </div>
                    <RangeControl label="Font size" value={editStyle.headlineFontSize ?? 60} min={24} max={150} step={1} suffix=" px" onChange={(value) => updateStyle("headlineFontSize", value)} />
                    <RangeControl label="Line height" value={editStyle.headlineLineHeight ?? 1.04} min={0.75} max={1.5} step={0.01} onChange={(value) => updateStyle("headlineLineHeight", value)} />
                    <RangeControl label="Letter spacing" value={editStyle.headlineLetterSpacing ?? 0} min={-2} max={8} step={0.1} suffix=" px" onChange={(value) => updateStyle("headlineLetterSpacing", value)} />
                    <RangeControl label="Panel opacity" value={editStyle.headlineBackgroundOpacity ?? 0.8} min={0} max={1} step={0.05} onChange={(value) => updateStyle("headlineBackgroundOpacity", value)} />

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <label className="flex items-center gap-2 text-muted">
                        <input type="checkbox" checked={editStyle.headlineShadow ?? true} onChange={(event) => updateStyle("headlineShadow", event.target.checked)} className="accent-accent" />
                        Text shadow
                      </label>
                      <label className="flex items-center gap-2 text-muted">
                        <input type="checkbox" checked={editStyle.headlineTransform === "uppercase"} onChange={(event) => updateStyle("headlineTransform", event.target.checked ? "uppercase" : "none")} className="accent-accent" />
                        Uppercase
                      </label>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">CTA button</p>
                      <p className="mt-0.5 text-xs text-muted">Button size, colors aur font bhi independently control karo.</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input type="checkbox" checked={editStyle.ctaVisible ?? true} onChange={(event) => updateStyle("ctaVisible", event.target.checked)} className="accent-accent" />
                      Show
                    </label>
                  </div>

                  {editStyle.ctaVisible !== false && (
                    <div className="mt-4 space-y-4 rounded-xl border border-border bg-background/60 p-4">
                      <label className="block text-xs text-muted">
                        <span className="mb-1.5 block">Button label</span>
                        <input value={editStyle.ctaText || "READ MORE"} onChange={(event) => updateStyle("ctaText", event.target.value)} maxLength={32} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent" />
                      </label>
                      <label className="block text-xs text-muted">
                        <span className="mb-1.5 block">Button font</span>
                        <select value={editStyle.ctaFontFamily || "sans"} onChange={(event) => updateStyle("ctaFontFamily", event.target.value as PinStyleFontFamily)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent">
                          {FONT_OPTIONS.map((font) => <option key={font.value} value={font.value}>{font.label}</option>)}
                        </select>
                      </label>
                      <div className="grid grid-cols-2 gap-4">
                        <ColorControl label="Button color" value={editStyle.ctaBackgroundColor || "#ffffff"} onChange={(value) => updateStyle("ctaBackgroundColor", value)} />
                        <ColorControl label="Button text" value={editStyle.ctaTextColor || "#111111"} onChange={(value) => updateStyle("ctaTextColor", value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <RangeControl label="Button font" value={editStyle.ctaFontSize ?? 24} min={12} max={64} step={1} suffix=" px" onChange={(value) => updateStyle("ctaFontSize", value)} />
                        <RangeControl label="Button width" value={editStyle.ctaWidth ?? 300} min={120} max={700} step={5} suffix=" px" onChange={(value) => updateStyle("ctaWidth", value)} />
                        <RangeControl label="Button height" value={editStyle.ctaHeight ?? 78} min={40} max={180} step={2} suffix=" px" onChange={(value) => updateStyle("ctaHeight", value)} />
                        <RangeControl label="Button spacing" value={editStyle.ctaLetterSpacing ?? 1.2} min={-1} max={6} step={0.1} suffix=" px" onChange={(value) => updateStyle("ctaLetterSpacing", value)} />
                      </div>
                    </div>
                  )}
                </>
              )}

              {activePin.keywords.length > 0 && (
                <div className="mt-6 border-t border-border pt-5">
                  <p className="text-xs text-muted">Keywords</p>
                  <p className="mt-1 text-sm">{activePin.keywords.join(", ")}</p>
                </div>
              )}
              </div>

              <div className="shrink-0 border-t border-border bg-surface/95 p-4 backdrop-blur sm:p-5">
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleSaveEdit} disabled={saving} className="flex-1 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 sm:flex-none">
                    {saving ? "Regenerating…" : "Save & regenerate pin"}
                  </button>
                  {!isManual && (
                    <button onClick={() => setEditStyle({})} disabled={saving} className="rounded-full border border-border px-4 py-2.5 text-sm text-muted transition hover:border-accent hover:text-foreground">
                      Reset style
                    </button>
                  )}
                  <button onClick={handleDeletePin} className="rounded-full border border-accent/40 px-4 py-2.5 text-sm text-accent transition hover:bg-accent/10">
                    Delete pin
                  </button>
                </div>
                <button onClick={() => setActivePin(null)} className="mt-3 text-sm text-muted transition hover:text-foreground">Close editor</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
