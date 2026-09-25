import { randomUUID } from "crypto";
import { readJson, writeJson } from "./kv";

export interface PinterestBoard {
  id: string;
  name: string;
  /** Short description of what this board is about — used by Gemini to match pins to it. */
  description: string;
}

export interface PinterestAccount {
  id: string;
  name: string;
  boards: PinterestBoard[];
  createdAt: string;
}

const KEY = "pinterest-accounts";

async function readAll(): Promise<PinterestAccount[]> {
  return readJson<PinterestAccount[]>(KEY, []);
}

async function writeAll(accounts: PinterestAccount[]) {
  await writeJson(KEY, accounts);
}

export async function getAccounts(): Promise<PinterestAccount[]> {
  const accounts = await readAll();
  return accounts.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAccount(id: string): Promise<PinterestAccount | undefined> {
  const accounts = await readAll();
  return accounts.find((a) => a.id === id);
}

export async function upsertAccount(input: { id?: string; name: string; boards: { name: string; description?: string }[] }): Promise<PinterestAccount> {
  const accounts = await readAll();
  const name = input.name.trim();
  if (!name) throw new Error("Account ka naam do");
  const boards: PinterestBoard[] = input.boards
    .map((b) => ({ id: randomUUID(), name: b.name.trim(), description: (b.description || "").trim() }))
    .filter((b) => b.name);

  if (input.id) {
    const idx = accounts.findIndex((a) => a.id === input.id);
    if (idx === -1) throw new Error("Account nahi mila");
    // Keep existing board ids where the name matches, so board history/state isn't lost on edit.
    const existing = accounts[idx];
    const merged = boards.map((b) => {
      const prior = existing.boards.find((eb) => eb.name.toLowerCase() === b.name.toLowerCase());
      return prior ? { ...b, id: prior.id } : b;
    });
    accounts[idx] = { ...existing, name, boards: merged };
    await writeAll(accounts);
    return accounts[idx];
  }

  const account: PinterestAccount = { id: randomUUID(), name, boards, createdAt: new Date().toISOString() };
  accounts.push(account);
  await writeAll(accounts);
  return account;
}

export async function deleteAccount(id: string): Promise<void> {
  const accounts = await readAll();
  await writeAll(accounts.filter((a) => a.id !== id));
}

/** Adds a newly-Gemini-suggested board to the account so it's available for future exports too. */
export async function addBoardToAccount(accountId: string, board: { name: string; description: string }): Promise<PinterestAccount> {
  const accounts = await readAll();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx === -1) throw new Error("Account nahi mila");
  const exists = accounts[idx].boards.some((b) => b.name.toLowerCase() === board.name.toLowerCase());
  if (!exists) {
    accounts[idx] = { ...accounts[idx], boards: [...accounts[idx].boards, { id: randomUUID(), name: board.name.trim(), description: board.description.trim() }] };
    await writeAll(accounts);
  }
  return accounts[idx];
}
