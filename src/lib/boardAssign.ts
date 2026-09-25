import { getGeminiModel, generateContentWithRetry } from "./gemini";
import type { PinterestBoard } from "./accounts";

export interface BoardAssignInput {
  pinIndex: number;
  title: string;
  description: string;
}

export interface BoardAssignResult {
  pinIndex: number;
  boardName: string;
  /** Present only when Gemini decided no existing board fit and proposed a brand-new one. */
  newBoard?: { name: string; description: string };
}

const BATCH_SIZE = 25;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Assigns the closest-matching board to each pin from the account's board list.
 * If nothing genuinely fits a pin, Gemini proposes ONE new, SEO-optimized board
 * name + description instead of forcing a bad match — matching how a human
 * curator (ChatGPT/Claude pasted manually) was doing this before.
 */
export async function assignBoards(pins: BoardAssignInput[], boards: PinterestBoard[], modelOverride?: string): Promise<BoardAssignResult[]> {
  if (pins.length === 0) return [];
  const model = await getGeminiModel(modelOverride);
  const boardList = boards.length
    ? boards.map((b) => `- "${b.name}": ${b.description || "(no description given)"}`).join("\n")
    : "(no boards exist yet — every pin will need a new board proposal)";

  const results: BoardAssignResult[] = [];
  for (const batch of chunk(pins, BATCH_SIZE)) {
    const pinList = batch
      .map((p) => `${p.pinIndex}. Title: ${p.title}\n   Description: ${p.description}`)
      .join("\n");

    const prompt = `You are a Pinterest content curator assigning pins to the correct board on an account.

Existing boards on this account:
${boardList}

Pins to assign (index, title, description):
${pinList}

Rules:
- For each pin, pick the SINGLE existing board whose topic genuinely fits best. Judge by real topical fit, not just keyword overlap.
- If NONE of the existing boards genuinely fit a pin's topic, do not force it — instead propose exactly ONE new board for it: a short, natural, SEO-optimized board name (max 6 words, no hashtags/emojis) and a 1-2 sentence SEO-optimized board description (max 300 characters) written the way a real Pinterest board description reads.
- Multiple pins in this batch may share the same newly proposed board if their topics genuinely match each other — reuse the same new board name/description for them instead of inventing a new one per pin.
- Never invent a board name that is a near-duplicate of an existing board — reuse the existing one instead.

Return ONLY valid JSON in exactly this shape, one entry per pin index given above:
{"assignments":[{"pinIndex":1,"boardName":"Existing Board Name"},{"pinIndex":2,"boardName":"New Board Name","newBoard":{"name":"New Board Name","description":"SEO description"}}]}`;

    const response = await generateContentWithRetry(model, prompt);
    const raw = response.response.text().trim().replace(/```json|```/g, "").trim();
    let parsed: { assignments?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { assignments: [] };
    }
    const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];

    for (const pin of batch) {
      const match = assignments.find((a): a is Record<string, unknown> => {
        return !!a && typeof a === "object" && Number((a as Record<string, unknown>).pinIndex) === pin.pinIndex;
      });
      const boardName = String(match?.boardName || boards[0]?.name || "General").trim();
      const newBoardRaw = match?.newBoard as { name?: unknown; description?: unknown } | undefined;
      const newBoard = newBoardRaw?.name
        ? { name: String(newBoardRaw.name).trim().slice(0, 60), description: String(newBoardRaw.description || "").trim().slice(0, 300) }
        : undefined;
      results.push({ pinIndex: pin.pinIndex, boardName, newBoard });
    }
  }
  return results;
}
