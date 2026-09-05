import { randomUUID } from "crypto";
import { readJson, writeJson } from "./kv";

export type BatchStatus = "pending" | "pins_created";

export interface Batch {
  id: string;
  name: string;
  accountLabel?: string;
  description?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  status: BatchStatus;
  exportedAt?: string;
}

const KEY = "batches";

async function readAll(): Promise<Batch[]> {
  const stored = await readJson<Array<Omit<Batch, "status"> & { status?: string }>>(KEY, []);
  return stored.map((batch) => {
    const legacyStatus = String(batch.status || "pending");
    return {
      ...batch,
      status: legacyStatus === "uploaded" || legacyStatus === "exported" || legacyStatus === "pins_created" ? "pins_created" : "pending",
    } as Batch;
  });
}

async function writeAll(batches: Batch[]) {
  await writeJson(KEY, batches);
}

export async function getAllBatches(): Promise<Batch[]> {
  const batches = await readAll();
  return batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getBatch(id: string): Promise<Batch | undefined> {
  const batches = await readAll();
  return batches.find((batch) => batch.id === id);
}

export async function addBatch(batch: Batch): Promise<Batch> {
  const batches = await readAll();
  batches.push(batch);
  await writeAll(batches);
  return batch;
}

export async function deleteBatch(id: string): Promise<boolean> {
  const batches = await readAll();
  const remaining = batches.filter((batch) => batch.id !== id);
  if (remaining.length === batches.length) return false;
  await writeAll(remaining);
  return true;
}

export async function updateBatchStatus(id: string, status: BatchStatus): Promise<Batch | undefined> {
  const batches = await readAll();
  const batch = batches.find((item) => item.id === id);
  if (!batch) return undefined;
  const now = new Date().toISOString();
  batch.status = status;
  batch.updatedAt = now;
  await writeAll(batches);
  return batch;
}

export async function markBatchPinsCreated(id: string): Promise<Batch | undefined> {
  return updateBatchStatus(id, "pins_created");
}

export async function updateBatchNotes(id: string, notes: string): Promise<Batch | undefined> {
  const batches = await readAll();
  const batch = batches.find((item) => item.id === id);
  if (!batch) return undefined;
  batch.notes = notes;
  batch.updatedAt = new Date().toISOString();
  await writeAll(batches);
  return batch;
}

export async function resolveBatchId(batchId?: string): Promise<string> {
  if (batchId) {
    const batch = await getBatch(batchId);
    if (!batch) throw new Error("Selected batch nahi mila");
    if (batch.status !== "pending") throw new Error("Ye batch Pins Created mark ho chuka hai; naye pins ke liye naya batch banao");
    return batch.id;
  }
  const batches = await getAllBatches();
  const unsorted = batches.find((batch) => batch.name === "Unsorted" && batch.status === "pending");
  if (unsorted) return unsorted.id;
  const now = new Date().toISOString();
  const created = await addBatch({
    id: randomUUID(),
    name: "Unsorted",
    description: "Posts created before batch selection was enabled.",
    createdAt: now,
    updatedAt: now,
    status: "pending",
  });
  return created.id;
}
