import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret } from "@/lib/apiAuth";
import { getAllPinsFlat } from "@/lib/store";
import { getCustomTemplates } from "@/lib/templateStore";
import { listAllR2Objects, publicUrlToKey, deleteR2Keys } from "@/lib/storage";

async function findOrphans() {
  const [objects, pins, templates] = await Promise.all([
    listAllR2Objects(),
    getAllPinsFlat(),
    getCustomTemplates(),
  ]);

  // Everything currently referenced by a pin (its rendered image, and any
  // source images that happen to live in R2 too) or a custom template.
  const referencedKeys = new Set<string>();
  for (const pin of pins) {
    const key = publicUrlToKey(pin.imageUrl);
    if (key) referencedKeys.add(key);
    for (const src of pin.sourceImageUrls || []) {
      const srcKey = publicUrlToKey(src);
      if (srcKey) referencedKeys.add(srcKey);
    }
  }
  for (const t of templates) {
    const key = publicUrlToKey(t.backgroundFile);
    if (key) referencedKeys.add(key);
  }

  const orphans = objects.filter((obj) => !referencedKeys.has(obj.key));
  const orphanBytes = orphans.reduce((sum, o) => sum + o.size, 0);
  const totalBytes = objects.reduce((sum, o) => sum + o.size, 0);

  return { objects, referencedKeys, orphans, orphanBytes, totalBytes };
}

function mb(bytes: number) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

/** Dry run: lists what WOULD be deleted, without deleting anything. */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const { objects, orphans, orphanBytes, totalBytes } = await findOrphans();
    return NextResponse.json({
      dryRun: true,
      totalObjects: objects.length,
      totalSizeMB: mb(totalBytes),
      orphanCount: orphans.length,
      orphanSizeMB: mb(orphanBytes),
      orphanKeys: orphans.map((o) => o.key),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Cleanup scan fail ho gaya" }, { status: 500 });
  }
}

/** Actually deletes the orphaned objects. Body: { confirm: true } required. */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== true) {
      return NextResponse.json({ error: "Body me { confirm: true } bhejo — safety check hai, taake galti se sab kuch delete na ho jaye" }, { status: 400 });
    }
    const { orphans, orphanBytes } = await findOrphans();
    if (orphans.length === 0) {
      return NextResponse.json({ deleted: 0, freedMB: 0, message: "Koi orphan image nahi mili — R2 already clean hai." });
    }
    const { deleted, errors } = await deleteR2Keys(orphans.map((o) => o.key));
    return NextResponse.json({
      deleted,
      freedMB: mb(orphanBytes),
      errors,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Cleanup delete fail ho gaya" }, { status: 500 });
  }
}
