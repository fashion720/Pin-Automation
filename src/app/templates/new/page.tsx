"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function NewTemplate() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [mode, setMode] = useState<"image" | "text" | null>(null);
  const [imageSlots, setImageSlots] = useState<Rect[]>([]);
  const [textSlot, setTextSlot] = useState<Rect | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const displaySizeRef = useRef({ w: 0, h: 0 });

  function handleFile(f: File) {
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setImageSlots([]);
    setTextSlot(null);
  }

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    displaySizeRef.current = { w: img.clientWidth, h: img.clientHeight };
  }

  function relPos(e: React.MouseEvent) {
    const box = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - box.left, 0), box.width),
      y: Math.min(Math.max(e.clientY - box.top, 0), box.height),
    };
  }

  function onMouseDown(e: React.MouseEvent) {
    if (!mode) return;
    const p = relPos(e);
    startRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!mode || !startRef.current) return;
    const p = relPos(e);
    const s = startRef.current;
    setDraft({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }

  function toNatural(r: Rect): Rect {
    const disp = displaySizeRef.current;
    const sx = natural.w / disp.w;
    const sy = natural.h / disp.h;
    return {
      x: Math.round(r.x * sx),
      y: Math.round(r.y * sy),
      w: Math.round(r.w * sx),
      h: Math.round(r.h * sy),
    };
  }

  function onMouseUp() {
    if (!mode || !draft) return;
    if (draft.w > 8 && draft.h > 8) {
      const natRect = toNatural(draft);
      if (mode === "image") setImageSlots((prev) => [...prev, natRect]);
      else setTextSlot(natRect);
    }
    setDraft(null);
    startRef.current = null;
    setMode(null);
  }

  function toDisplay(r: Rect): Rect {
    const disp = displaySizeRef.current;
    const sx = disp.w / natural.w;
    const sy = disp.h / natural.h;
    return { x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy };
  }

  async function handleSave() {
    setError("");
    if (!file) return setError("Pehle template image upload karo.");
    if (!name.trim()) return setError("Template ka naam do.");
    if (imageSlots.length === 0) return setError("Kam se kam ek image slot draw karo.");

    setSaving(true);
    try {
      // 1. Get a presigned R2 upload URL — the file goes straight from this
      //    browser to R2, never through our server, so there's no size limit.
      const presignRes = await fetch("/api/upload-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "templates", contentType: file.type }),
      });
      const presignText = await presignRes.text();
      const presignData = presignText ? JSON.parse(presignText) : {};
      if (!presignRes.ok) throw new Error(presignData.error || "Upload URL nahi mila");

      // 2. Upload the actual file bytes directly to R2.
      const putRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(
          "R2 upload fail ho gaya — bucket ki CORS policy check karo (README dekho)."
        );
      }

      // 3. Save the small metadata (name, slot geometry, resulting public URL).
      const textPayload = textSlot
        ? {
            ...textSlot,
            fontSize: Math.round(textSlot.h * 0.35),
            color: "#ffffff",
            align: "center" as const,
          }
        : null;

      const saveRes = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          backgroundFile: presignData.publicUrl,
          width: natural.w,
          height: natural.h,
          imageSlots,
          textSlot: textPayload,
        }),
      });
      const saveText = await saveRes.text();
      const saveData = saveText ? JSON.parse(saveText) : {};
      if (!saveRes.ok) throw new Error(saveData.error || "Save fail ho gaya");

      router.push("/templates");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">New template</h1>
      <p className="text-muted text-sm mb-8">
        Apna Canva template upload karo, phir mouse se drag kar ke batao
        images kahan jaani hain aur text kahan — pixels khud calculate ho
        jayenge, tumhe kuch type nahi karna.
      </p>

      {!previewUrl && (
        <label className="block border border-dashed border-border rounded-2xl py-20 text-center cursor-pointer hover:border-accent/50 transition">
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <span className="text-muted">Click karke template image (PNG/JPG) chuno</span>
        </label>
      )}

      {previewUrl && (
        <>
          <div className="mb-4">
            <input
              type="text"
              placeholder="Template ka naam (e.g. Collage v2)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-sm outline-none focus:border-accent transition"
            />
          </div>

          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => setMode("image")}
              className={`text-sm px-4 py-2 rounded-full border transition ${
                mode === "image"
                  ? "bg-accent border-accent text-white"
                  : "border-border hover:border-muted"
              }`}
            >
              + Draw image slot
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`text-sm px-4 py-2 rounded-full border transition ${
                mode === "text"
                  ? "bg-accent border-accent text-white"
                  : "border-border hover:border-muted"
              }`}
            >
              + Draw text slot
            </button>
            {mode && (
              <span className="text-xs text-muted">
                Ab image pe click-hold-drag karo rectangle banane ke liye…
              </span>
            )}
          </div>

          <div
            ref={containerRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            className="relative inline-block select-none"
            style={{ cursor: mode ? "crosshair" : "default" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="template"
              onLoad={onImgLoad}
              className="max-w-full rounded-lg border border-border block"
              draggable={false}
            />

            {imageSlots.map((r, i) => {
              const d = toDisplay(r);
              return (
                <div
                  key={i}
                  className="absolute border-2 border-accent bg-accent/20 flex items-center justify-center text-xs text-white font-medium"
                  style={{ left: d.x, top: d.y, width: d.w, height: d.h }}
                >
                  Image {i + 1}
                  <button
                    type="button"
                    onClick={() =>
                      setImageSlots((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="absolute -top-2 -right-2 bg-accent text-white rounded-full w-5 h-5 text-[10px] leading-5"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            {textSlot && (
              <div
                className="absolute border-2 border-yellow-400 bg-yellow-400/20 flex items-center justify-center text-xs text-white font-medium"
                style={(() => {
                  const d = toDisplay(textSlot);
                  return { left: d.x, top: d.y, width: d.w, height: d.h };
                })()}
              >
                Text
                <button
                  type="button"
                  onClick={() => setTextSlot(null)}
                  className="absolute -top-2 -right-2 bg-yellow-400 text-black rounded-full w-5 h-5 text-[10px] leading-5"
                >
                  ×
                </button>
              </div>
            )}

            {draft && (
              <div
                className="absolute border-2 border-dashed border-white/70"
                style={{ left: draft.x, top: draft.y, width: draft.w, height: draft.h }}
              />
            )}
          </div>

          <p className="text-xs text-muted mt-3">
            {imageSlots.length} image slot{imageSlots.length !== 1 ? "s" : ""} ·{" "}
            {textSlot ? "1 text slot" : "koi text slot nahi (optional)"}
          </p>

          {error && (
            <p className="text-sm text-accent bg-accent/10 border border-accent/30 rounded-lg px-4 py-3 mt-4">
              {error}
            </p>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-accent text-white px-6 py-3 rounded-full text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save template"}
            </button>
            <button
              onClick={() => {
                setFile(null);
                setPreviewUrl("");
                setImageSlots([]);
                setTextSlot(null);
              }}
              className="px-6 py-3 rounded-full text-sm border border-border hover:border-muted transition"
            >
              Different image chuno
            </button>
          </div>
        </>
      )}
    </div>
  );
}
