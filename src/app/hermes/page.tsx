"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

import { MAX_COMPANIES, SWIPE_THRESH } from "@/features/hermes/constants";
import { parseCompaniesFromInput } from "@/features/hermes/utils";
import type { ParsedCompany, Contact, Step } from "@/features/hermes/types";

import ConfirmModal from "@/features/hermes/components/confirmModal";
import NoteModal from "@/features/hermes/components/noteModal";
import CompanyInput from "@/features/hermes/steps/companyInput";
import CompanyReview from "@/features/hermes/steps/companyReview";

import CompanyResearch from "@/features/hermes/steps/companyResearch";
import CompanyContactsReview from "@/features/hermes/steps/companyContactsReview";
import EmailReview from "@/features/hermes/steps/emailReview";
import FinalStep from "@/features/hermes/steps/finalStep";
import Header from "@/features/hermes/components/header";


export default function HermesPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(-1);
  const [inputText, setInputText] = useState("");
  const [companies, setCompanies] = useState<ParsedCompany[]>([]);

  const canProceedFromInput = useMemo(() => inputText.trim().length > 0, [inputText]);
  const detectedCount = useMemo(
    () => parseCompaniesFromInput(inputText, MAX_COMPANIES).length,
    [inputText]
  );
  
  const progressPct =
    step === -1 ? 0 : step === 0 ? 20 : step === 1 ? 40 : step === 2 ? 60 : step === 3 ? 80 : 100;
  const [currentCompanyIndex, setCurrentCompanyIndex] = useState(0);
  const [onHold, setOnHold] = useState<ParsedCompany[]>([]);
  const [deleted, setDeleted] = useState<ParsedCompany[]>([]);
  const [contactsByCompany, setContactsByCompany] = useState<Record<number, Contact[]>>({});
  const [currentContactIndex, setCurrentContactIndex] = useState(0);
  const [emailDraftsByCompany, setEmailDraftsByCompany] = useState<
    Record<number, Record<string, { subject: string; body: string }>>
  >({});
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

  // Landing interactions
  const [isLandingAnimating, setIsLandingAnimating] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [ctaPressed, setCtaPressed] = useState(false); // shows quick check on press

  function goFromLandingToStep0() {
    setIsLandingAnimating(true);
    setTimeout(() => {
      setInputText("");
      setStep(0);
      setIsLandingAnimating(false);
      setCtaPressed(false);
    }, 320); // keep in sync with CSS duration
  }

  // Ensure contacts exist for a company if we have seed data from parsing
  function seedContactsForCompanyIfMissing(index: number): Contact[] {
    let seeded: Contact[] = (contactsByCompany[index] || []).slice();
    if (seeded.length === 0) {
      const c = companies[index];
      const parsedContacts = (c?.contacts || []).filter((pc) => pc.email || pc.name);
      if (parsedContacts.length > 0) {
        seeded = parsedContacts.map((pc) => ({
          id: crypto.randomUUID(),
          name: pc.name || "",
          title: pc.title || "",
          email: pc.email || "",
          selected: true,
        }));
      } else if (c?.contactEmail || c?.contactName) {
        seeded.push({
          id: crypto.randomUUID(),
          name: c.contactName || "",
          title: "",
          email: c.contactEmail || "",
          selected: true,
        });
      }
      if (seeded.length > 0) setContactsByCompany((prev) => ({ ...prev, [index]: seeded }));
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

  function handleParse() {
    const parsed = parseCompaniesFromInput(inputText, MAX_COMPANIES);
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

  // Manage contacts within a company during the Review step
  function ensureContactsForReview(index: number): Array<{ name?: string; email?: string; title?: string }> {
    const c = companies[index];
    const existing = c.contacts || [];
    if (existing.length === 0 && (c.contactName || c.contactEmail)) {
      const seeded = [{ name: c.contactName, email: c.contactEmail, title: "" }];
      setCompanies((prev) => prev.map((co, i) => (i === index ? { ...co, contacts: seeded } : co)));
      return seeded;
    }
    return existing;
  }

  function addCompanyContact(index: number) {
    setCompanies((prev) =>
      prev.map((co, i) =>
        i === index ? { ...co, contacts: [ ...(co.contacts || []), { name: "", title: "", email: "" } ] } : co
      )
    );
  }

  function updateCompanyContact(
    index: number,
    contactIndex: number,
    patch: Partial<{ name?: string; email?: string; title?: string }>
  ) {
    setCompanies((prev) =>
      prev.map((co, i) => {
        if (i !== index) return co;
        const list = [ ...(co.contacts || []) ];
        list[contactIndex] = { ...list[contactIndex], ...patch };
        return { ...co, contacts: list };
      })
    );
  }

  function removeCompanyContact(index: number, contactIndex: number) {
    setCompanies((prev) =>
      prev.map((co, i) => {
        if (i !== index) return co;
        const list = [ ...(co.contacts || []) ];
        list.splice(contactIndex, 1);
        return { ...co, contacts: list };
      })
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto">
        <Header onKingaClick={() => router.push("/")} />
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
            className={`relative mx-auto max-w-2xl flex flex-col items-center justify-center text-center
                        min-h-[60vh] transition-transform duration-300 ease-in-out
                        ${isLandingAnimating ? "-translate-y-[120%]" : "translate-y-0"}`}
            onTouchStart={(e) => setTouchStartY(e.changedTouches[0].clientY)}
            onTouchEnd={(e) => {
              const endY = e.changedTouches[0].clientY;
              if (touchStartY !== null && touchStartY - endY > SWIPE_THRESH) {
                setCtaPressed(true); // mimic pressed state on swipe
                setTimeout(goFromLandingToStep0, 200);
              }
              setTouchStartY(null);
            }}
          >
            <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
              <button
                type="button"
                onClick={() => {
                  setCtaPressed(true);
                  setTimeout(goFromLandingToStep0, 200);
                }}
                className="group relative overflow-hidden px-8 py-4 md:py-5 rounded-2xl text-xl text-primary-foreground hover:opacity-95 w-full
                           transition-transform active:scale-[0.98]"
                style={{ backgroundColor: "var(--color-turquoise)" }}
                aria-label="Get started"
              >
                <span className={`inline-flex items-center gap-2 transition-opacity ${ctaPressed ? "opacity-0" : "opacity-100"}`}>
                  Get Started
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </span>
                {/* quick check flash */}
                <span className={`absolute inset-0 flex items-center justify-center transition-opacity ${ctaPressed ? "opacity-100" : "opacity-0"}`}>
                  <Check className="h-5 w-5" />
                </span>
                {/* sheen sweep */}
                <span
                  className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                             bg-white/10 blur-md transform transition-transform duration-500
                             group-hover:translate-x-[260%]"
                />
              </button>

              <button
                type="button"
                onClick={() => router.push("/activity")}
                className="px-8 py-4 md:py-5 rounded-2xl text-xl border hover:bg-secondary w-full transition-colors"
                style={{ borderColor: "#0077D1", color: "#0077D1" }}
              >
                View Queue
              </button>
            </div>

            {/* Down-arrow CTA (micro “press → check”) */}
           
            
          </div>
        ) : step === 0 ? (
            <CompanyInput
              value={inputText}
              onChange={setInputText}
              canProceed={canProceedFromInput}
              detectedCount={Math.min(detectedCount, MAX_COMPANIES)}
              maxCompanies={MAX_COMPANIES}
              onBack={() => setStep(-1)}
              onParse={handleParse}
            />
         
        ) : step === 1 ? (

          <CompanyReview
          companies={companies}
          maxCompanies={MAX_COMPANIES}
          onBack={() => setStep(0)}
          onNext={() => {
            setCurrentCompanyIndex(0);
            setStep(2);
          }}
          onAddRow={handleAddRow}
          onRemoveRow={handleRemoveRow}
          onUpdateCompany={updateCompany}
          ensureContactsForReview={ensureContactsForReview}
          onAddCompanyContact={addCompanyContact}
          onUpdateCompanyContact={updateCompanyContact}
          onRemoveCompanyContact={removeCompanyContact}
        />
          
        ) : step === 2 ? (
          <CompanyResearch
          companyName={companies[currentCompanyIndex]?.name || "Unnamed"}
          website={companies[currentCompanyIndex]?.website}
          currentIndex={currentCompanyIndex}
          total={companies.length}
          onBack={() => {
            setCurrentCompanyIndex((i) => {
              if (i > 0) return i - 1;
              setStep(1);
              return 0;
            });
          }}
          onHold={() => openActionModal("hold")}
          onDelete={() => openActionModal("delete")}
          onNext={() => {
            // seed parsed contacts if present, then go to contacts step
            seedContactsForCompanyIfMissing(currentCompanyIndex);
            setCurrentContactIndex(0);
            setStep(3);
          }}
        />
        ) : step === 3 ? (
          <CompanyContactsReview
          companyName={companies[currentCompanyIndex]?.name || "Company"}
          contacts={contactsByCompany[currentCompanyIndex] || []}
          onToggleSelected={(idx: any, selected: any) => {
            setContactsByCompany((prev) => {
              const list = [...(prev[currentCompanyIndex] || [])];
              list[idx] = { ...list[idx], selected };
              return { ...prev, [currentCompanyIndex]: list };
            });
          }}
          onChangeField={(idx: any, field: any, value: any) => {
            setContactsByCompany((prev) => {
              const list = [...(prev[currentCompanyIndex] || [])];
              list[idx] = { ...list[idx], [field]: value };
              return { ...prev, [currentCompanyIndex]: list };
            });
          }}
          onRemove={(idx: any) => {
            setContactsByCompany((prev) => {
              const list = [...(prev[currentCompanyIndex] || [])];
              list.splice(idx, 1);
              return { ...prev, [currentCompanyIndex]: list };
            });
          }}
          onAdd={() => {
            setContactsByCompany((prev) => {
              const cur = prev[currentCompanyIndex] || [];
              const next = [
                ...cur,
                { id: crypto.randomUUID(), name: "", title: "", email: "", selected: true },
              ];
              return { ...prev, [currentCompanyIndex]: next };
            });
          }}
          onBack={() => setStep(2)}
          onNext={() => {
            const selected = (contactsByCompany[currentCompanyIndex] || []).filter((c) => c.selected);
            setEmailDraftsByCompany((prev) => {
              const map = { ...(prev[currentCompanyIndex] || {}) } as Record<
                string,
                { subject: string; body: string }
              >;
              selected.forEach((c) => {
                if (!map[c.id]) {
                  map[c.id] = {
                    subject: `${companies[currentCompanyIndex]?.name || ""} — quick intro`,
                    body: `Hi ${c.name || "there"},\n\nI wanted to share a quick idea on how we can help ${
                      companies[currentCompanyIndex]?.name || "your team"
                    }.\n\nBest,\n`,
                  };
                }
              });
              return { ...prev, [currentCompanyIndex]: map };
            });
            setCurrentContactIndex(0);
            setStep(4);
          }}
        />
        ) : null}
        {step === 4 ? (

          (() => {
            const selected = (contactsByCompany[currentCompanyIndex] || []).filter((c) => c.selected);
            const cur = selected[currentContactIndex] || selected[0];
            const draftsForCompany = emailDraftsByCompany[currentCompanyIndex] || {};
            const draft = cur ? (draftsForCompany[cur.id] || { subject: "", body: "" }) : { subject: "", body: "" };

            return (
              <EmailReview
                companyName={companies[currentCompanyIndex]?.name || "Company"}
                selectedContacts={selected}
                currentIndex={currentContactIndex}
                draft={draft}
                onChangeSubject={(v) => {
                  if (!cur) return;
                  setEmailDraftsByCompany((prev) => {
                    const byCo = { ...(prev[currentCompanyIndex] || {}) };
                    byCo[cur.id] = { ...(byCo[cur.id] || { subject: "", body: "" }), subject: v };
                    return { ...prev, [currentCompanyIndex]: byCo };
                  });
                }}
                onChangeBody={(v) => {
                  if (!cur) return;
                  setEmailDraftsByCompany((prev) => {
                    const byCo = { ...(prev[currentCompanyIndex] || {}) };
                    byCo[cur.id] = { ...(byCo[cur.id] || { subject: "", body: "" }), body: v };
                    return { ...prev, [currentCompanyIndex]: byCo };
                  });
                }}
                improveNotes={improveNotes}
                onChangeImproveNotes={setImproveNotes}
                onApplyImproveNotes={() => {
                  if (!cur) return;
                  if (!improveNotes.trim()) return;
                  setEmailDraftsByCompany((prev) => {
                    const byCo = { ...(prev[currentCompanyIndex] || {}) };
                    const curDraft = byCo[cur.id] || { subject: "", body: "" };
                    byCo[cur.id] = { ...curDraft, body: `${curDraft.body}\n\n[Applied notes]: ${improveNotes}` };
                    return { ...prev, [currentCompanyIndex]: byCo };
                  });
                  setImproveNotes("");
                }}
                onBackToContacts={() => setStep(3)}
                onHold={() => openActionModal("hold")}
                onNextOrSend={advanceToNextContactOrCompany}
              />
            );
          })()         
        ) : null}
        {step === 5 ? (
          <FinalStep onHome={() => setStep(-1)} />
        ) : null}
        {step === 6 && lastAction?.type === "hold" ? (
          <div className="mx-auto max-w-3xl space-y-4 py-16">
            <h2 className="text-2xl font-semibold">Placed on hold</h2>
            <div className="rounded-xl ring-1 ring-border/40 bg-secondary/60 p-5 text-sm">
              <div className="mb-2">
                <span className="text-muted-foreground">Company:</span> {lastAction.companyName}
              </div>
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
                className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-95 transition-transform active:scale-[0.98]"
                style={{ backgroundColor: "var(--color-turquoise)" }}
              >
                Continue
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                <span
                  className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                             bg-white/10 blur-md transform transition-transform duration-500
                             group-hover:translate-x-[260%]"
                />
              </button>
            </div>
          </div>
        ) : null}
        {step === 7 && lastAction?.type === "delete" ? (
          <div className="mx-auto max-w-3xl space-y-4 py-16">
            <h2 className="text-2xl font-semibold">Deleted company</h2>
            <div className="rounded-xl ring-1 ring-border/40 bg-secondary/60 p-5 text-sm">
              <div className="mb-2">
                <span className="text-muted-foreground">Company:</span> {lastAction.companyName}
              </div>
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
                className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-95 transition-transform active:scale-[0.98]"
                style={{ backgroundColor: "var(--color-turquoise)" }}
              >
                Continue
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                <span
                  className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                             bg-white/10 blur-md transform transition-transform duration-500
                             group-hover:translate-x-[260%]"
                />
              </button>
            </div>
          </div>
        ) : null}

        {/* Confirmation Modal */}
        <ConfirmModal
          open={showConfirmModal}
          action={pendingAction}
          companyName={companies[currentCompanyIndex]?.name || "this company"}
          onCancel={cancelActionModal}
          onConfirm={confirmActionProceed}
        />

        <NoteModal
          open={showNoteModal}
          action={pendingAction}
          note={actionNote}
          onNoteChange={setActionNote}
          onCancel={cancelActionModal}
          onSubmit={submitActionNote}
        />
      </div>
    </div>
  );
}
