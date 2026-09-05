"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TemplateDef } from "@/lib/templates";

type TemplateRow = TemplateDef & { isCustom: boolean };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);

  function load() {
    fetch("/api/templates")
      .then((r) => r.json())
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }

  useEffect(load, []);

  async function handleDelete(id: string) {
    if (!confirm("Ye template delete karna hai?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-muted text-sm mt-1">
            Naya template add karo — upload karo, mouse se slots draw karo, ban gaya.
          </p>
        </div>
        <Link
          href="/templates/new"
          className="bg-accent text-white px-5 py-2.5 rounded-full text-sm hover:opacity-90 transition whitespace-nowrap"
        >
          + New template
        </Link>
      </div>

      {templates === null && <p className="text-muted">Loading…</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {templates?.map((t) => (
          <div
            key={t.id}
            className="bg-surface border border-border rounded-2xl overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={t.backgroundFile}
              alt={t.name}
              className="w-full aspect-[2/3] object-cover bg-border"
            />
            <div className="p-3">
              <p className="text-sm font-medium">{t.name}</p>
              <p className="text-xs text-muted mt-0.5">
                {t.imageCount} image{t.imageCount !== 1 ? "s" : ""}
                {!t.isCustom && " · built-in"}
              </p>
              {t.isCustom && (
                <button
                  onClick={() => handleDelete(t.id)}
                  className="text-xs text-accent hover:underline mt-2"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
