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
  const [step, setStep] = useState<0 | 1>(0);
  const [inputText, setInputText] = useState("");
  const [companies, setCompanies] = useState<ParsedCompany[]>([]);

  const canProceedFromInput = useMemo(() => inputText.trim().length > 0, [inputText]);

  const progressPct = step === 0 ? 50 : 100;

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

    const linesSource = raw.includes("\n") ? raw.split(/\n+/) : raw.split(/,|;|\n/g);
    const lines = linesSource.map((l) => l.trim()).filter((l) => !!l);

    const results: ParsedCompany[] = [];
    const seen = new Set<string>();

    for (const line of lines) {
      if (results.length >= MAX_COMPANIES) break;

      const emails = Array.from(line.matchAll(emailRe)).map((m) => m[0]);
      const urls = Array.from(line.matchAll(urlRe)).map((m) => m[1]);

      let remainder = line
        .replace(emailRe, " ")
        .replace(urlRe, " ")
        .replace(/[|•·•\-–—,:]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

      let candidateName = remainder;
      if (!candidateName && urls[0]) candidateName = normalizeDomainToName(urls[0]);

      const name = toTitleCase(candidateName).slice(0, 120);
      const website = urls[0] || undefined;
      const contactEmail = emails[0] || undefined;

      const key = `${name.toLowerCase()}|${(website || "").toLowerCase()}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);

      results.push({ name, website, contactEmail });
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
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Hermes</h1>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2 rounded-lg text-sm bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="Back to chat"
          >
            Kinga
          </button>
        </div>

        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-8">
          <div
            className="h-full bg-primary/90 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {step === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="block text-sm font-medium text-muted-foreground">Enter companies (max {MAX_COMPANIES})</label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={10}
                className="w-full rounded-xl bg-secondary border border-transparent p-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
                placeholder={`One per line or paste text.\nExamples:\nAcme Corp\nhttps://contoso.com, jane@contoso.com`}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Freeform is OK — we will parse names, sites, and emails.</span>
                <span className="px-2 py-0.5 rounded-md bg-secondary">{Math.min(parseCompaniesFromInput(inputText).length, MAX_COMPANIES)} detected</span>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  disabled={!canProceedFromInput}
                  onClick={handleParse}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 w-full sm:w-auto"
                >
                  <span>Parse & Review</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                <div className="font-medium mb-2">Example</div>
                <pre className="whitespace-pre-wrap">{`Acme Corporation\nacme.com\nJane Doe, jane@acme.com\n\nContoso Ltd - https://contoso.com`}</pre>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium tracking-tight">Review companies</h2>
              <div className="px-2 py-1 rounded-md text-xs bg-secondary text-muted-foreground">{companies.length}/{MAX_COMPANIES}</div>
            </div>

            <div className="space-y-2">
              {companies.length === 0 && (
                <div className="text-sm text-muted-foreground">No companies parsed. Add manually below.</div>
              )}

              {companies.map((c, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-6 md:grid-cols-12 gap-3 bg-secondary rounded-xl p-3">
                  <input
                    value={c.name}
                    onChange={(e) => updateCompany(i, { name: e.target.value })}
                    placeholder="Company name"
                    className="sm:col-span-6 md:col-span-4 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <input
                    value={c.website || ""}
                    onChange={(e) => updateCompany(i, { website: e.target.value })}
                    placeholder="Website"
                    className="sm:col-span-6 md:col-span-3 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <input
                    value={c.contactName || ""}
                    onChange={(e) => updateCompany(i, { contactName: e.target.value })}
                    placeholder="Contact name"
                    className="sm:col-span-6 md:col-span-3 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <div className="sm:col-span-6 md:col-span-2 relative">
                    <input
                      value={c.contactEmail || ""}
                      onChange={(e) => updateCompany(i, { contactEmail: e.target.value })}
                      placeholder="Contact email"
                      className="w-full pr-9 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary w-full sm:w-auto"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleAddRow}
                  disabled={companies.length >= MAX_COMPANIES}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add company</span>
                </button>
              </div>
              <button
                onClick={() => { /* placeholder for next step */ }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

