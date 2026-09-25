import sharp from "sharp";
import path from "path";
import fs from "fs";
import { TEMPLATES } from "./templates";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/**
 * Safety net for deployments where a generated preview asset is missing.
 * Normal builds ship all built-in layout PNGs, so this is intentionally
 * minimal and never draws old template systems over the new compositions.
 */
export async function ensurePlaceholderTemplates() {
  for (const t of TEMPLATES) {
    const filePath = path.join(PUBLIC_DIR, t.backgroundFile);
    if (fs.existsSync(filePath)) continue;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const svg = `<svg width="${t.width}" height="${t.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#eee7dc"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(filePath);
  }
}
