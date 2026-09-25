"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Post, Pin } from "@/lib/store";

interface PinRow extends Pin {
  postId: string;
  postTitle: string;
  articleUrl: string;
}

interface Board {
  id: string;
  name: string;
  description: string;
}

interface Account {
  id: string;
  name: string;
  boards: Board[];
}

interface PlanPin {
  pinId: string;
  postId: string;
  title: string;
  imageUrl: string;
  articleUrl: string;
  description: string;
  dayOffset: number;
  dayDate: string;
  scheduledAt: string;
  boardName: string;
  isNewBoard: boolean;
}

interface NewBoardProposal {
  name: string;
  description: string;
  pinCount: number;
}

interface DaySummary {
  dayOffset: number;
  date: string;
  pinCount: number;
}

interface RepeatWarning {
  date: string;
  articleUrl: string;
  count: number;
}

interface Plan {
  pins: PlanPin[];
  newBoards: NewBoardProposal[];
  days: DaySummary[];
  repeats: RepeatWarning[];
}

function localDateTime(hoursAhead = 1): string {
  const date = new Date(Date.now() + hoursAhead * 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PinterestExportPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [pinsPerDay, setPinsPerDay] = useState(6);
  const [startAt, setStartAt] = useState(localDateTime());
  const [planning, setPlanning] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Plan (preview, awaiting approval)
  const [plan, setPlan] = useState<Plan | null>(null);
  const [editedBoards, setEditedBoards] = useState<NewBoardProposal[]>([]);
  const [approvedNew, setApprovedNew] = useState<Set<string>>(new Set());

  // New account form
  const [newAccountName, setNewAccountName] = useState("");
  const [newBoardsText, setNewBoardsText] = useState("");
  const [savingAccount, setSavingAccount] = useState(false);

  const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";

  const pins = useMemo<PinRow[]>(
    () => posts?.flatMap((post) => post.pins.map((pin) => ({ ...pin, postId: post.id, postTitle: post.title, articleUrl: post.articleUrl }))) || [],
    [posts]
  );
  const selectedPins = useMemo(() => {
    const set = new Set(selectedIds);
    return pins.filter((pin) => set.has(pin.id));
  }, [pins, selectedIds]);
  const selectedAccount = accounts.find((a) => a.id === accountId);

  function loadAccounts() {
    fetch("/api/pinterest-accounts")
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts || []);
        if (!accountId && data.accounts?.length) setAccountId(data.accounts[0].id);
      })
      .catch(() => setAccounts([]));
  }

  useEffect(() => {
    fetch("/api/posts")
      .then((response) => response.json())
      .then((data: Post[]) => {
        setPosts(data);
        setSelectedIds(data.flatMap((post) => post.pins).map((pin) => pin.id));
      })
      .catch(() => setPosts([]));
    loadAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePin(pinId: string) {
    setSelectedIds((current) => (current.includes(pinId) ? current.filter((id) => id !== pinId) : [...current, pinId]));
  }

  async function saveAccount() {
    setError("");
    if (!newAccountName.trim()) return setError("Account ka naam do (e.g. jis pinterest profile ke liye ye boards hain)");
    setSavingAccount(true);
    try {
      const boards = newBoardsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, ...rest] = line.split("|");
          return { name: name.trim(), description: rest.join("|").trim() };
        });
      const response = await fetch("/api/pinterest-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newAccountName, boards }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Account save nahi hua");
      setNewAccountName("");
      setNewBoardsText("");
      loadAccounts();
      setAccountId(data.account.id);
      setSuccess(`Account "${data.account.name}" ${data.account.boards.length} boards ke saath save ho gaya.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Kuch masla ho gaya");
    } finally {
      setSavingAccount(false);
    }
  }

  async function generatePlan() {
    setError("");
    setSuccess("");
    setPlan(null);
    if (selectedPins.length < 1) return setError("Kam se kam ek pin select karo.");
    if (!accountId) return setError("Pehle ek Pinterest account select/add karo.");
    setPlanning(true);
    try {
      const response = await fetch("/api/pinterest-auto/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          pinsPerDay,
          startAt: new Date(startAt).toISOString(),
          timeZone,
          pinIds: selectedIds,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Plan banane mein masla hua");
      setPlan(data.plan);
      setEditedBoards(data.plan.newBoards);
      setApprovedNew(new Set(data.plan.newBoards.map((b: NewBoardProposal) => b.name)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Kuch masla ho gaya");
    } finally {
      setPlanning(false);
    }
  }

  function updateBoardField(originalName: string, field: "name" | "description", value: string) {
    setEditedBoards((current) => current.map((b) => (b.name === originalName ? { ...b, [field]: value } : b)));
  }

  function toggleApproveBoard(name: string) {
    setApprovedNew((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function approveAndDownload() {
    if (!plan || !accountId) return;
    setError("");
    setFinalizing(true);
    try {
      // Boards the user unchecked stay out of the account dictionary AND out of
      // the CSV's board column — fall back those pins to the account's first
      // existing board (or blank) so the export never has a dangling board name.
      const approvedBoardsFinal = editedBoards.filter((b) => approvedNew.has(b.name));
      const rejectedOriginalNames = new Set(plan.newBoards.filter((b) => !approvedNew.has(b.name)).map((b) => b.name));
      const nameMap = new Map(plan.newBoards.map((orig, i) => [orig.name, editedBoards[i]?.name || orig.name]));
      const fallbackBoard = selectedAccount?.boards[0]?.name || "";

      const finalPins = plan.pins.map((p) => {
        if (p.isNewBoard && rejectedOriginalNames.has(p.boardName)) {
          return { pinId: p.pinId, boardName: fallbackBoard, scheduledAt: p.scheduledAt };
        }
        const renamed = p.isNewBoard ? nameMap.get(p.boardName) || p.boardName : p.boardName;
        return { pinId: p.pinId, boardName: renamed, scheduledAt: p.scheduledAt };
      });

      const response = await fetch("/api/pinterest-auto/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          timeZone,
          newBoards: approvedBoardsFinal,
          pins: finalPins,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Finalize fail ho gaya");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "pinterest-pins.csv";
      downloadBlob(blob, filename);
      loadAccounts();
      setSuccess(`${finalPins.length} pins ka CSV ban gaya — seedha upload kar sakte ho.`);
      setPlan(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Kuch masla ho gaya");
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted transition hover:text-foreground">← Posts</Link>
        <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-accent">Ready-to-upload Pinterest CSV</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Auto board-assign export</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Account select karo, pins/day batao, plan generate karo — naye boards ko review/approve karo, phir CSV download karo.
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {success && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{success}</div>}

      <div className="mb-8 grid gap-6 rounded-2xl border border-white/10 bg-white/5 p-6 md:grid-cols-2">
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-muted">Pinterest account</label>
          <select
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setPlan(null); }}
          >
            <option value="">— select —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.boards.length} boards)</option>
            ))}
          </select>
          {selectedAccount && (
            <p className="mt-2 text-xs text-muted">
              {selectedAccount.boards.length
                ? `Boards: ${selectedAccount.boards.map((b) => b.name).join(", ")}`
                : "Ye account naya hai — abhi koi board nahi. Pehla plan sab pins ke liye naye boards propose karega."}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <label className="text-xs font-medium uppercase tracking-wide text-muted">Pins / day</label>
            <input
              type="number"
              min={1}
              max={30}
              value={pinsPerDay}
              onChange={(e) => { setPinsPerDay(Number(e.target.value) || 6); setPlan(null); }}
              className="w-20 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
            <div className="flex gap-1">
              {[6, 9].map((n) => (
                <button key={n} type="button" onClick={() => { setPinsPerDay(n); setPlan(null); }} className="rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/10">{n}/day</button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs font-medium uppercase tracking-wide text-muted">Start date/time (day 1 se roz continuous chalega)</label>
            <input
              type="datetime-local"
              value={startAt}
              onChange={(e) => { setStartAt(e.target.value); setPlan(null); }}
              className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={generatePlan}
            disabled={planning}
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {planning ? "Schedule + board matching (Gemini) chal raha hai..." : `${selectedPins.length} pins ka plan banao`}
          </button>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Naya account add karo (ya boards update)</p>
          <input
            placeholder="Account naam (e.g. Outfit Edits main)"
            value={newAccountName}
            onChange={(e) => setNewAccountName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
          />
          <textarea
            placeholder={"Har line ek board: Board Name | short description\nFall Outfits for Women | Seasonal fall outfit ideas and layering tips\nMidsize Fashion | Everyday outfits for midsize women\n\n(Naya account ho toh khali chhod do — 'no boards' state khud handle hoti hai)"}
            value={newBoardsText}
            onChange={(e) => setNewBoardsText(e.target.value)}
            rows={7}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={saveAccount}
            disabled={savingAccount}
            className="mt-2 w-full rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/10 disabled:opacity-50"
          >
            {savingAccount ? "Save ho raha hai..." : "Account save karo"}
          </button>
        </div>
      </div>

      {plan && (
        <div className="mb-8 rounded-2xl border border-accent/30 bg-accent/5 p-6">
          <h2 className="text-lg font-semibold">Plan ready — review karo aur approve karo</h2>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Day-by-day summary ({plan.pins.length} pins, {plan.days.length} days)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {plan.days.map((d) => (
                <span key={d.dayOffset} className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs">
                  {d.date}: <span className="font-semibold">{d.pinCount}</span> pins
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Same-day URL repeats {plan.repeats.length === 0 ? "— koi nahi, sab days unique URLs 🎉" : `(${plan.repeats.length})`}
            </p>
            {plan.repeats.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-amber-300">
                {plan.repeats.map((r, i) => (
                  <li key={i}>{r.date}: <span className="break-all">{r.articleUrl}</span> — {r.count}x us din</li>
                ))}
              </ul>
            )}
          </div>

          {plan.newBoards.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Naye proposed boards ({plan.newBoards.length}) — approve/edit karo, phir download hoga
              </p>
              <div className="mt-2 space-y-3">
                {editedBoards.map((b) => {
                  const original = plan.newBoards[editedBoards.findIndex((x) => x === b)];
                  const isApproved = approvedNew.has(original.name);
                  return (
                    <div key={original.name} className="rounded-lg border border-white/10 bg-black/30 p-3">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={isApproved} onChange={() => toggleApproveBoard(original.name)} />
                        <input
                          value={b.name}
                          onChange={(e) => updateBoardField(original.name, "name", e.target.value)}
                          className="flex-1 rounded-md border border-white/10 bg-transparent px-2 py-1 text-sm font-medium"
                        />
                        <span className="text-xs text-muted">{original.pinCount} pins</span>
                      </div>
                      <textarea
                        value={b.description}
                        onChange={(e) => updateBoardField(original.name, "description", e.target.value)}
                        rows={2}
                        className="mt-2 w-full rounded-md border border-white/10 bg-transparent px-2 py-1 text-xs"
                      />
                      {!isApproved && <p className="mt-1 text-xs text-amber-300">Reject kiya — is board ke pins account ke pehle existing board me chale jayenge.</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={approveAndDownload}
            disabled={finalizing}
            className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {finalizing ? "Approve ho raha hai..." : "Approve + CSV download karo"}
          </button>
        </div>
      )}

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Pins is batch mein ({selectedPins.length} selected / {pins.length} total)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {pins.map((pin) => (
            <button
              key={pin.id}
              onClick={() => { togglePin(pin.id); setPlan(null); }}
              className={`rounded-xl border p-2 text-left text-xs transition ${selectedIds.includes(pin.id) ? "border-accent bg-accent/10" : "border-white/10 bg-white/5"}`}
            >
              <img src={pin.imageUrl} alt="" className="mb-2 aspect-[2/3] w-full rounded-lg object-cover" />
              <p className="line-clamp-2 font-medium">{pin.pinTitle || pin.overlayText || pin.postTitle}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
