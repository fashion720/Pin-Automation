import { TEMPLATES } from "../src/lib/templates";
import { rotateLayoutIds } from "../src/lib/visualRotation";

const selected = TEMPLATES.filter((template) => ["layout-2", "layout-10", "layout-14"].includes(template.id));
if (selected.length !== 3 || selected.some((template) => !template.selectionLabel)) throw new Error("Named template selection metadata is incomplete");
if (!selected.some((template) => template.imageCount === 16) || !selected.some((template) => template.imageCount === 3)) throw new Error("Grid/three-image templates missing");

const ids = TEMPLATES.map((template) => template.id);
const first = rotateLayoutIds(ids, "https://example.com/tide");
const second = rotateLayoutIds(ids, "https://example.com/backpack");
if (first.join(",") !== rotateLayoutIds(ids, "https://example.com/tide").join(",")) throw new Error("Rotation is not deterministic");
if (first.join(",") === second.join(",")) throw new Error("Different URLs did not rotate");

console.log(JSON.stringify({ templateCount: TEMPLATES.length, selected: selected.map((template) => ({ id: template.id, name: template.selectionLabel, images: template.imageCount })), rotationDiffers: first[0] !== second[0] }, null, 2));
