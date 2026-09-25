import { getAllPinsFlat } from "./store";
import type { SchedulablePin } from "./schedule";

export interface PinSelectionOptions {
  batchId?: string;
  postIds?: string[];
  pinIds?: string[];
}

export async function selectPins(options: PinSelectionOptions): Promise<SchedulablePin[]> {
  const allPins = (await getAllPinsFlat()) as SchedulablePin[];
  if (allPins.length === 0) throw new Error("Abhi koi pin generate nahi hui");
  const batchSelected = options.batchId ? allPins.filter((pin) => pin.batchId === options.batchId) : allPins;
  const postWanted = options.postIds?.length ? new Set(options.postIds) : null;
  const postSelected = postWanted ? batchSelected.filter((pin) => postWanted.has(pin.postId)) : batchSelected;
  const wanted = options.pinIds?.length ? new Set(options.pinIds) : null;
  const selected = wanted ? postSelected.filter((pin) => wanted.has(pin.id)) : postSelected;
  if (selected.length === 0) throw new Error("Selected pins nahi mile");
  return selected;
}
