"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, ArrowLeft, ArrowRight } from "lucide-react";

type ParsedCompany = {
  name: string;
  website?: string;
  contactName?: string;
  contactEmail?: string;
};

const MAX_COMPANIES = 10;

export default function HermesPage() {
  const router = useRouter();
  const [step, setStep] = useState<-1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7>(-1);
  const [inputText, setInputText] = useState("");
  const [companies, setCompanies] = useState<ParsedCompany[]>([]);

  const canProceedFromInput = useMemo(() => inputText.trim().length > 0, [inputText]);
  const progressPct = step === -1 ? 0 : step === 0 ? 20 : step === 1 ? 40 : step === 2 ? 60 : step === 3 ? 80 : 100;
  const [currentCompanyIndex, setCurrentCompanyIndex] = useState(0);
  const [onHold, setOnHold] = useState<ParsedCompany[]>([]);
  const [deleted, setDeleted] = useState<ParsedCompany[]>([]);
  type Contact = { id: string; name: string; title: string; email: string; selected: boolean };
  const [contactsByCompany, setContactsByCompany] = useState<Record<number, Contact[]>>({});
  const [currentContactIndex, setCurrentContactIndex] = useState(0);
  const [emailDraftsByCompany, setEmailDraftsByCompany] = useState<Record<number, Record<string, { subject: string; body: string }>>>({});
  const [improveNotes, setImproveNotes] = useState("");
  const [pendingAction, setPendingAction] = useState<null | "hold" | "delete">(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [actionNote, setActionNote] = useState("");
  const [holdNotesByCompany, setHoldNotesByCompany] = useState<Record<number, string>>({});
  const [deleteNotesByCompany, setDeleteNotesByCompany] = useState<Record<number, string>>({});
  const [lastAction, setLastAction] = useState<
    null | { type: "hold" | "delete"; companyName: string; note: string; fromIndex: number; toIndex: number | null }
  >(null);
  const [isLandingAnimating, setIsLandingAnimating] = useState(false);

  // Ensure contacts exist for a company if we have seed data from parsing
  function seedContactsForCompanyIfMissing(index: number): Contact[] {
    let seeded: Contact[] = (contactsByCompany[index] || []).slice();
    if (seeded.length === 0) {
      const c = companies[index];
      if (c?.contactEmail || c?.contactName) {
        seeded.push({
          id: crypto.randomUUID(),
          name: c.contactName || "",
          title: "",
          email: c.contactEmail || "",
          selected: true,
        });
        setContactsByCompany((prev) => ({ ...prev, [index]: seeded }));
      }
    }
    return seeded;
  }

  function getSelectedContacts(index: number): Contact[] {
    return (contactsByCompany[index] || []).filter((c) => c.selected);
  }

  // After finishing contacts for a company, move to the next company; otherwise mark done
  function advanceToNextCompanyOrFinish() {
    const next = currentCompanyIndex + 1;
    if (next < companies.length) {
      setCurrentCompanyIndex(next);
      seedContactsForCompanyIfMissing(next);
      setCurrentContactIndex(0);
      setStep(3);
      return;
    }
    setStep(5);
  }

  function advanceToNextContactOrCompany() {
    const selected = getSelectedContacts(currentCompanyIndex);
    const nextIndex = currentContactIndex + 1;
    if (nextIndex < selected.length) {
      setCurrentContactIndex(nextIndex);
    } else {
      advanceToNextCompanyOrFinish();
    }
  }

  function openActionModal(action: "hold" | "delete") {
    setPendingAction(action);
    setShowConfirmModal(true);
  }

  function cancelActionModal() {
    setPendingAction(null);
    setShowConfirmModal(false);
    setShowNoteModal(false);
    setActionNote("");
  }

  function confirmActionProceed() {
    setShowConfirmModal(false);
    setShowNoteModal(true);
  }

  function submitActionNote() {
    const note = actionNote.trim();
    if (!pendingAction || !note) return;
    const fromIndex = currentCompanyIndex;
    const toIndex = fromIndex + 1 < companies.length ? fromIndex + 1 : null;
    const company = companies[fromIndex];
    const name = company?.name || "Company";

    if (pendingAction === "hold") {
      setOnHold((prev) => [...prev, company]);
      setHoldNotesByCompany((prev) => ({ ...prev, [fromIndex]: note }));
      setLastAction({ type: "hold", companyName: name, note, fromIndex, toIndex });
      setCurrentCompanyIndex(toIndex ?? fromIndex);
      setStep(6);
    } else if (pendingAction === "delete") {
      setDeleted((prev) => [...prev, company]);
      setDeleteNotesByCompany((prev) => ({ ...prev, [fromIndex]: note }));
      setLastAction({ type: "delete", companyName: name, note, fromIndex, toIndex });
      setCurrentCompanyIndex(toIndex ?? fromIndex);
      setStep(7);
    }

    setShowNoteModal(false);
    setPendingAction(null);
    setActionNote("");
  }

  function toTitleCase(value: string): string {
    return value
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
      .trim();
  }

  function normalizeDomainToName(domain: string): string {
    const clean = domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    const root = clean.split("/")[0] || clean;
    const noTld = root.replace(/\.[a-z]{2,}$/i, "");
    return toTitleCase(noTld.replace(/[._-]+/g, " "));
  }

  function parseCompaniesFromInput(raw: string): ParsedCompany[] {
    const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const urlRe = /((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,})(?:\/[\w\-./?%&=]*)?/gi;

    // Split companies by blank lines. This lets users paste multiple lines per company.
    const blocks = raw
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    const results: ParsedCompany[] = [];
    const seen = new Set<string>();

    for (const block of blocks) {
      if (results.length >= MAX_COMPANIES) break;

      const emails = Array.from(block.matchAll(emailRe)).map((m) => m[0]);
      const urls = Array.from(block.matchAll(urlRe)).map((m) => m[1]);

      const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);

      // Try to get a contact name from text immediately before the first email
      let contactName: string | undefined;
      if (emails[0]) {
        const before = block.slice(0, block.indexOf(emails[0]));
        const lastChunk = before.split(/[,|\n]/).pop()?.trim() || "";
        if (lastChunk.split(/\s+/).length >= 2) contactName = toTitleCase(lastChunk).slice(0, 120);
      }

      // Choose a company name: first non-email/non-url line; otherwise from domain
      let candidateName = lines.find((l) => !emailRe.test(l) && !urlRe.test(l));
      if (!candidateName && urls[0]) candidateName = normalizeDomainToName(urls[0]);

      const name = toTitleCase(candidateName || "").slice(0, 120);
      const website = urls[0] || undefined;
      const contactEmail = emails[0] || undefined;

      if (!name && !website && !contactEmail) continue;

      const key = `${(name || "").toLowerCase()}|${(website || "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({ name, website, contactName, contactEmail });
    }

    // If the user entered text but we found no blank-line blocks, treat the entire input as one company
    if (results.length === 0 && raw.trim()) {
      const emails = Array.from(raw.matchAll(emailRe)).map((m) => m[0]);
      const urls = Array.from(raw.matchAll(urlRe)).map((m) => m[1]);
      let candidateName = raw
        .replace(emailRe, " ")
        .replace(urlRe, " ")
        .replace(/[|•·•\-–—,:]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (!candidateName && urls[0]) candidateName = normalizeDomainToName(urls[0]);
      const name = toTitleCase(candidateName).slice(0, 120);
      results.push({ name, website: urls[0], contactEmail: emails[0] });
    }

    return results.slice(0, MAX_COMPANIES);
  }

  function handleParse() {
    const parsed = parseCompaniesFromInput(inputText);
    setCompanies(parsed);
    setStep(1);
  }

  function handleAddRow() {
    if (companies.length >= MAX_COMPANIES) return;
    setCompanies((prev) => [...prev, { name: "" }]);
  }

  function handleRemoveRow(index: number) {
    setCompanies((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCompany(index: number, patch: Partial<ParsedCompany>) {
    setCompanies((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Agent Hermes</h1>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-6 py-3 rounded-2xl text-lg text-primary-foreground hover:opacity-90 transition-colors"
            style={{ backgroundColor: "#0b1526" }}
            aria-label="Back to chat"
          >
            Kinga
          </button>
        </div>

        {step !== -1 ? (
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden mb-10">
            <div
              className="h-full transition-all"
              style={{ width: `${progressPct}%`, backgroundColor: "var(--color-sharp-orange)" }}
            />
          </div>
        ) : null}

        {step === -1 ? (
          <div
            className="mx-auto max-w-2xl flex flex-col items-center justify-center text-center"
            style={{ minHeight: "60vh", transform: isLandingAnimating ? "translateY(-120%)" : "translateY(0)", transition: "transform 320ms ease-in-out" }}
          >
           
            <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
              <button
                type="button"
                onClick={() => {
                  setIsLandingAnimating(true);
                  setTimeout(() => {
                    setStep(0);
                    setIsLandingAnimating(false);
                  }, 320);
                }}
                className="px-8 py-4 md:py-5 rounded-2xl text-xl text-primary-foreground hover:opacity-90 w-full"
                style={{ backgroundColor: "var(--color-turquoise)" }}
              >
                Get Started
              </button>
              <button
                type="button"
                onClick={() => router.push("/activity")}
                className="px-8 py-4 md:py-5 rounded-2xl text-xl border hover:bg-secondary w-full"
                style={{ borderColor: "#0077D1", color: "#0077D1" }}
              >
                View Queue
              </button>
            </div>
          </div>
        ) : step === 0 ? (
          <div className="mx-auto max-w-3xl">
            <div className="text-center mb-6">
              <h2 className="text-xl md:text-2xl font-medium tracking-tight mb-1">Enter companies</h2>
              <p className="text-sm text-muted-foreground">Up to {MAX_COMPANIES}. Separate each company with a blank line.</p>
            </div>
            <div className="space-y-4">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={10}
                className="w-full rounded-2xl bg-secondary/70 border border-border/30 p-5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 shadow-sm"
                placeholder={`Paste details and separate COMPANIES with a blank line.\nExample (1 company):\nAcme Corp\nacme.com\nJane Doe, jane@acme.com\n\nExample (2 companies):\nAcme Corp\nacme.com\n\nContoso Ltd - https://contoso.com`}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>We’ll parse names, sites, and emails.</span>
                <span className="px-2 py-0.5 rounded-md bg-secondary/80">{Math.min(parseCompaniesFromInput(inputText).length, MAX_COMPANIES)} detected</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <button
                  onClick={() => setStep(-1)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
                  style={{ borderColor: "#0077D1", color: "#0077D1" }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  disabled={!canProceedFromInput}
                  onClick={handleParse}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-turquoise)" }}
                >
                  <span>Parse & Review</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : step === 1 ? (
          <div className="mx-auto max-w-6xl space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-medium tracking-tight">Review companies</h2>
              <div className="px-2 py-1 rounded-md text-xs bg-secondary text-muted-foreground">{companies.length}/{MAX_COMPANIES}</div>
            </div>

            <div className="space-y-3">
              {companies.length === 0 && (
                <div className="text-sm text-muted-foreground">No companies parsed. Add manually below.</div>
              )}

              {companies.map((c, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-6 md:grid-cols-12 gap-3 bg-secondary/70 rounded-2xl p-4 shadow-sm ring-1 ring-border/40">
                  <input
                    value={c.name}
                    onChange={(e) => updateCompany(i, { name: e.target.value })}
                    placeholder="Company name"
                    className="sm:col-span-6 md:col-span-4 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    value={c.website || ""}
                    onChange={(e) => updateCompany(i, { website: e.target.value })}
                    placeholder="Website"
                    className="sm:col-span-6 md:col-span-3 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    value={c.contactName || ""}
                    onChange={(e) => updateCompany(i, { contactName: e.target.value })}
                    placeholder="Contact name"
                    className="sm:col-span-6 md:col-span-2 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="sm:col-span-6 md:col-span-3 relative">
                    <input
                      value={c.contactEmail || ""}
                      onChange={(e) => updateCompany(i, { contactEmail: e.target.value })}
                      placeholder="Contact email"
                      className="w-full pr-9 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={() => handleRemoveRow(i)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-background/60 text-muted-foreground"
                      aria-label="Delete row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setStep(0)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border w-full sm:w-auto hover:bg-secondary"
                  style={{ borderColor: "#0077D1", color: "#0077D1" }}
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleAddRow}
                  disabled={companies.length >= MAX_COMPANIES}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border disabled:opacity-50 w-full sm:w-auto hover:bg-secondary"
                  style={{ borderColor: "#0077D1", color: "#0077D1" }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Add company</span>
                </button>
              </div>
              <button
                onClick={() => { setCurrentCompanyIndex(0); setStep(2); }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-90 w-full sm:w-auto"
                style={{ backgroundColor: "var(--color-turquoise)" }}
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : step === 2 ? (
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-medium tracking-tight">Company Research</h2>
              <div className="px-2 py-1 rounded-md text-xs bg-secondary text-muted-foreground">
                {Math.min(currentCompanyIndex + 1, companies.length)}/{companies.length}
              </div>
            </div>

            {companies.length === 0 ? (
              <div className="text-sm text-muted-foreground">No companies to research.</div>
            ) : (
              <div className="rounded-2xl ring-1 ring-border/40 bg-secondary/60 p-5 md:p-6 space-y-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Company</div>
                  <div className="text-lg font-semibold">{companies[currentCompanyIndex]?.name || "Unnamed"}</div>
                </div>
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {/* Placeholder research summary */}
                  This is a placeholder research summary for the selected company. In a future step, this will
                  include industry, size, geography, and relevant notes gathered from enrichment sources.
                </div>
                <div className="flex items-center gap-3">
                  <input
                    value={companies[currentCompanyIndex]?.website || ""}
                    readOnly
                    placeholder="Website"
                    className="rounded-lg bg-background border border-transparent px-3 py-2 text-sm flex-1"
                  />
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Scoring</div>
                  <div className="min-h-[140px] rounded-xl bg-background ring-1 ring-border/40 p-4 text-sm text-muted-foreground">
                    Placeholder for ICP scoring across attributes (industry, geography, size, etc.).
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    onClick={() => {
                      setCurrentCompanyIndex((i) => {
                        if (i > 0) return i - 1;
                        setStep(1);
                        return 0;
                      });
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
                    style={{ borderColor: "#0077D1", color: "#0077D1" }}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openActionModal("hold")}
                      className="px-5 py-2.5 rounded-xl border bg-secondary text-foreground hover:bg-secondary/80"
                    >
                      Hold
                    </button>
                    <button
                      onClick={() => openActionModal("delete")}
                      className="px-5 py-2.5 rounded-xl text-white hover:opacity-90"
                      style={{ backgroundColor: "var(--color-sharp-orange)" }}
                    >
                      Delete
                    </button>
                  <button
                    onClick={() => {
                      // Proceed to contact selection for current company
                      // initialize contacts if absent
                      setContactsByCompany((prev) => {
                        if (prev[currentCompanyIndex]) return prev;
                        const seed: Contact[] = [];
                        const c = companies[currentCompanyIndex];
                        if (c?.contactEmail || c?.contactName) {
                          seed.push({
                            id: crypto.randomUUID(),
                            name: c.contactName || "",
                            title: "",
                            email: c.contactEmail || "",
                            selected: true,
                          });
                        }
                        return { ...prev, [currentCompanyIndex]: seed };
                      });
                      setCurrentContactIndex(0);
                      setStep(3);
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-90"
                    style={{ backgroundColor: "var(--color-turquoise)" }}
                  >
                    <span>Next</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : step === 3 ? (
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-medium tracking-tight">Contact selection</h2>
              <div className="text-sm text-muted-foreground">{companies[currentCompanyIndex]?.name || "Company"}</div>
            </div>

            <div className="space-y-3">
              {(contactsByCompany[currentCompanyIndex] || []).map((p, idx) => (
                <div key={p.id} className="grid grid-cols-12 gap-3 bg-secondary/60 rounded-2xl p-4 ring-1 ring-border/40 items-center">
                  <div className="col-span-12 sm:col-span-1 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={(e) =>
                        setContactsByCompany((prev) => {
                          const list = [...(prev[currentCompanyIndex] || [])];
                          list[idx] = { ...list[idx], selected: e.target.checked };
                          return { ...prev, [currentCompanyIndex]: list };
                        })
                      }
                    />
                  </div>
                  <input
                    value={p.name}
                    onChange={(e) =>
                      setContactsByCompany((prev) => {
                        const list = [...(prev[currentCompanyIndex] || [])];
                        list[idx] = { ...list[idx], name: e.target.value };
                        return { ...prev, [currentCompanyIndex]: list };
                      })
                    }
                    placeholder="Name"
                    className="col-span-12 sm:col-span-3 rounded-lg bg-background border border-transparent px-3 py-2 text-sm"
                  />
                  <input
                    value={p.title}
                    onChange={(e) =>
                      setContactsByCompany((prev) => {
                        const list = [...(prev[currentCompanyIndex] || [])];
                        list[idx] = { ...list[idx], title: e.target.value };
                        return { ...prev, [currentCompanyIndex]: list };
                      })
                    }
                    placeholder="Title"
                    className="col-span-12 sm:col-span-3 rounded-lg bg-background border border-transparent px-3 py-2 text-sm"
                  />
                  <div className="col-span-12 sm:col-span-4 relative">
                    <input
                      value={p.email}
                      onChange={(e) =>
                        setContactsByCompany((prev) => {
                          const list = [...(prev[currentCompanyIndex] || [])];
                          list[idx] = { ...list[idx], email: e.target.value };
                          return { ...prev, [currentCompanyIndex]: list };
                        })
                      }
                      placeholder="Email"
                      className="w-full rounded-lg bg-background border border-transparent px-3 py-2 text-sm pr-9"
                    />
                    <button
                      onClick={() =>
                        setContactsByCompany((prev) => {
                          const list = [...(prev[currentCompanyIndex] || [])];
                          list.splice(idx, 1);
                          return { ...prev, [currentCompanyIndex]: list };
                        })
                      }
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-background/60 text-muted-foreground"
                      aria-label="Remove contact"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
                style={{ borderColor: "#0077D1", color: "#0077D1" }}
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    setContactsByCompany((prev) => {
                      const cur = prev[currentCompanyIndex] || [];
                      const next = [
                        ...cur,
                        { id: crypto.randomUUID(), name: "", title: "", email: "", selected: true },
                      ];
                      return { ...prev, [currentCompanyIndex]: next };
                    })
                  }
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
                  style={{ borderColor: "#0077D1", color: "#0077D1" }}
                >
                  <Plus className="w-4 h-4" /> Add contact
                </button>
                <button
                  onClick={() => {
                    const selected = (contactsByCompany[currentCompanyIndex] || []).filter((c) => c.selected);
                    setEmailDraftsByCompany((prev) => {
                      const map = { ...(prev[currentCompanyIndex] || {}) } as Record<string, { subject: string; body: string }>;
                      selected.forEach((c) => {
                        if (!map[c.id]) {
                          map[c.id] = {
                            subject: `${companies[currentCompanyIndex]?.name || ""} — quick intro`,
                            body: `Hi ${c.name || "there"},\n\nI wanted to share a quick idea on how we can help ${companies[currentCompanyIndex]?.name || "your team"}.\n\nBest,\n`,
                          };
                        }
                      });
                      return { ...prev, [currentCompanyIndex]: map };
                    });
                    setCurrentContactIndex(0);
                    setStep(4);
                  }}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-90"
                  style={{ backgroundColor: "var(--color-turquoise)" }}
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : step === 4 ? (
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl md:text-2xl font-medium tracking-tight">Email generation</h2>
              <div className="text-sm text-muted-foreground">
                {(() => {
                  const selected = (contactsByCompany[currentCompanyIndex] || []).filter((c) => c.selected);
                  return `${Math.min(currentContactIndex + 1, selected.length)}/${selected.length || 1}`;
                })()}
              </div>
            </div>

            {(() => {
              const selected = (contactsByCompany[currentCompanyIndex] || []).filter((c) => c.selected);
              const cur = selected[currentContactIndex] || selected[0];
              if (!cur) {
                return <div className="text-sm text-muted-foreground">No contacts selected. Go back and choose at least one.</div>;
              }
              const draftsForCompany = emailDraftsByCompany[currentCompanyIndex] || {};
              const draft = draftsForCompany[cur.id] || { subject: "", body: "" };

              return (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
                    <div className="rounded-2xl ring-1 ring-border/40 bg-secondary/60 p-5 md:p-6 space-y-3 flex flex-col">
                      <div className="text-xs text-muted-foreground">Sending to</div>
                      <div className="text-sm text-foreground">
                        {cur.name || cur.email || "Recipient"}
                        {cur.title ? (
                          <span className="text-muted-foreground"> — {cur.title}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{cur.email}</div>
                      <input
                        value={draft.subject}
                        onChange={(e) =>
                          setEmailDraftsByCompany((prev) => {
                            const byCo = { ...(prev[currentCompanyIndex] || {}) };
                            byCo[cur.id] = { ...(byCo[cur.id] || { subject: "", body: "" }), subject: e.target.value };
                            return { ...prev, [currentCompanyIndex]: byCo };
                          })
                        }
                        placeholder="Subject"
                        className="w-full rounded-lg bg-background border border-transparent px-3 py-2 text-sm"
                      />
                      <textarea
                        value={draft.body}
                        onChange={(e) =>
                          setEmailDraftsByCompany((prev) => {
                            const byCo = { ...(prev[currentCompanyIndex] || {}) };
                            byCo[cur.id] = { ...(byCo[cur.id] || { subject: "", body: "" }), body: e.target.value };
                            return { ...prev, [currentCompanyIndex]: byCo };
                          })
                        }
                        rows={12}
                        placeholder="Write your email..."
                        className="w-full rounded-lg bg-background border border-transparent px-3 py-2 text-sm min-h-[300px] flex-1"
                      />
                      <div className="flex justify-end mt-auto">
                        <button
                          onClick={() => {
                            // send placeholder then advance
                            advanceToNextContactOrCompany();
                          }}
                          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-90"
                          style={{ backgroundColor: "var(--color-turquoise)" }}
                        >
                          Send
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl ring-1 ring-border/40 bg-secondary/60 p-5 md:p-6 space-y-4 flex flex-col">
                      <label className="text-sm font-medium text-muted-foreground">Improve with notes</label>
                      <textarea
                        value={improveNotes}
                        onChange={(e) => setImproveNotes(e.target.value)}
                        rows={12}
                        placeholder="Tell Hermes how to refine the email (tone, points, CTA, etc.)"
                        className="mt-2 mb-3 w-full rounded-lg bg-background border border-transparent px-3 py-2 text-sm min-h-[300px] flex-1"
                      />
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            if (!improveNotes.trim()) return;
                            setEmailDraftsByCompany((prev) => {
                              const byCo = { ...(prev[currentCompanyIndex] || {}) };
                              const curDraft = byCo[cur.id] || { subject: "", body: "" };
                              byCo[cur.id] = { ...curDraft, body: `${curDraft.body}\n\n[Applied notes]: ${improveNotes}` };
                              return { ...prev, [currentCompanyIndex]: byCo };
                            });
                            setImproveNotes("");
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-primary-foreground hover:opacity-90"
                          style={{ backgroundColor: "var(--color-turquoise)" }}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-16 md:mt-24">
                    <button
                      onClick={() => setStep(3)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
                      style={{ borderColor: "#0077D1", color: "#0077D1" }}
                    >
                      <ArrowLeft className="w-4 h-4" /> Contacts
                    </button>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openActionModal("hold")}
                        className="px-5 py-2.5 rounded-xl border bg-secondary text-foreground hover:bg-secondary/80"
                      >
                        Hold
                      </button>
                      <button
                        onClick={advanceToNextContactOrCompany}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-90"
                        style={{ backgroundColor: "var(--color-turquoise)" }}
                      >
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-8 md:mt-12" />
                </div>
              );
            })()}
          </div>
        ) : null}
        {step === 5 ? (
          <div className="mx-auto max-w-3xl text-center py-24">
            <h2 className="text-2xl md:text-3xl font-semibold mb-2">Done</h2>
            <p className="text-sm text-muted-foreground">All contacts across companies have been processed.</p>
          </div>
        ) : null}
        {step === 6 && lastAction?.type === "hold" ? (
          <div className="mx-auto max-w-3xl space-y-4 py-16">
            <h2 className="text-2xl font-semibold">Placed on hold</h2>
            <div className="rounded-xl ring-1 ring-border/40 bg-secondary/60 p-5 text-sm">
              <div className="mb-2"><span className="text-muted-foreground">Company:</span> {lastAction.companyName}</div>
              <div className="text-muted-foreground">Note:</div>
              <div className="whitespace-pre-wrap">{lastAction.note}</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
                style={{ borderColor: "#0077D1", color: "#0077D1" }}
              >
                <ArrowLeft className="w-4 h-4" /> Back to research
              </button>
              <button
                onClick={() => {
                  // Continue to next company's contacts or Done
                  const nextIndex = lastAction?.toIndex ?? null;
                  if (nextIndex === null) {
                    setStep(5);
                    return;
                  }
                  setCurrentCompanyIndex(nextIndex);
                  seedContactsForCompanyIfMissing(nextIndex);
                  setCurrentContactIndex(0);
                  setStep(3);
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-90"
                style={{ backgroundColor: "var(--color-turquoise)" }}
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}
        {step === 7 && lastAction?.type === "delete" ? (
          <div className="mx-auto max-w-3xl space-y-4 py-16">
            <h2 className="text-2xl font-semibold">Deleted company</h2>
            <div className="rounded-xl ring-1 ring-border/40 bg-secondary/60 p-5 text-sm">
              <div className="mb-2"><span className="text-muted-foreground">Company:</span> {lastAction.companyName}</div>
              <div className="text-muted-foreground">Note:</div>
              <div className="whitespace-pre-wrap">{lastAction.note}</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
                style={{ borderColor: "#0077D1", color: "#0077D1" }}
              >
                <ArrowLeft className="w-4 h-4" /> Back to research
              </button>
              <button
                onClick={() => {
                  const nextIndex = lastAction?.toIndex ?? null;
                  if (nextIndex === null) {
                    setStep(5);
                    return;
                  }
                  setCurrentCompanyIndex(nextIndex);
                  seedContactsForCompanyIfMissing(nextIndex);
                  setCurrentContactIndex(0);
                  setStep(3);
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-90"
                style={{ backgroundColor: "var(--color-turquoise)" }}
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : null}

        {/* Confirmation Modal */}
        {showConfirmModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={cancelActionModal} />
            <div className="relative w-full max-w-md rounded-2xl bg-background ring-1 ring-border/40 p-6 space-y-4">
              <div className="text-lg font-medium">{pendingAction === "hold" ? "Put company on hold?" : "Delete company?"}</div>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to {pendingAction === "hold" ? "hold" : "delete"} {companies[currentCompanyIndex]?.name || "this company"}?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={cancelActionModal}
                  className="px-4 py-2 rounded-xl border hover:bg-secondary"
                  style={{ borderColor: "#0077D1", color: "#0077D1" }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmActionProceed}
                  className="px-5 py-2.5 rounded-xl text-primary-foreground hover:opacity-90"
                  style={{ backgroundColor: "var(--color-turquoise)" }}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Note Modal */}
        {showNoteModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={cancelActionModal} />
            <div className="relative w-full max-w-lg rounded-2xl bg-background ring-1 ring-border/40 p-6 space-y-4">
              <div className="text-lg font-medium">Add a note ({pendingAction})</div>
              <textarea
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                rows={6}
                placeholder={pendingAction === "hold" ? "Why is this on hold?" : "Why is this being deleted?"}
                className="w-full rounded-xl bg-secondary/60 border border-transparent p-3 text-sm"
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={cancelActionModal}
                  className="px-4 py-2 rounded-xl border hover:bg-secondary"
                  style={{ borderColor: "#0077D1", color: "#0077D1" }}
                >
                  Cancel
                </button>
                <button
                  onClick={submitActionNote}
                  disabled={!actionNote.trim()}
                  className="px-5 py-2.5 rounded-xl text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-turquoise)" }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

