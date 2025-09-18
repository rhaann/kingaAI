"use client";

import { Trash2, Plus, ArrowLeft, ArrowRight } from "lucide-react";
import type { ParsedCompany } from "@/features/hermes/types";

type ContactPatch = Partial<{ name?: string; email?: string; title?: string }>;

type Props = {
  companies: ParsedCompany[];
  maxCompanies: number;
  onBack: () => void;
  onNext: () => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onUpdateCompany: (index: number, patch: Partial<ParsedCompany>) => void;
  ensureContactsForReview: (index: number) => Array<{ name?: string; email?: string; title?: string }>;
  onAddCompanyContact: (index: number) => void;
  onUpdateCompanyContact: (index: number, contactIndex: number, patch: ContactPatch) => void;
  onRemoveCompanyContact: (index: number, contactIndex: number) => void;
};

export default function CompanyReview({
  companies,
  maxCompanies,
  onBack,
  onNext,
  onAddRow,
  onRemoveRow,
  onUpdateCompany,
  ensureContactsForReview,
  onAddCompanyContact,
  onUpdateCompanyContact,
  onRemoveCompanyContact,
}: Props) {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-medium tracking-tight">Review companies</h2>
        <div className="px-2 py-1 rounded-md text-xs bg-secondary text-muted-foreground">
          {companies.length}/{maxCompanies}
        </div>
      </div>

      <div className="space-y-3">
        {companies.length === 0 && (
          <div className="text-sm text-muted-foreground">No companies parsed. Add manually below.</div>
        )}

        {companies.map((c, i) => {
          const contacts = ensureContactsForReview(i);
          return (
            <div key={i} className="space-y-3 bg-secondary/70 rounded-2xl p-4 shadow-sm ring-1 ring-border/40">
              <div className="grid grid-cols-1 sm:grid-cols-6 md:grid-cols-12 gap-3">
                <input
                  value={c.name}
                  onChange={(e) => onUpdateCompany(i, { name: e.target.value })}
                  placeholder="Company name"
                  className="sm:col-span-6 md:col-span-4 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  value={c.website || ""}
                  onChange={(e) => onUpdateCompany(i, { website: e.target.value })}
                  placeholder="Website"
                  className="sm:col-span-6 md:col-span-3 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Contacts</div>
                {contacts.map((p, ci) => (
                  <div key={ci} className="grid grid-cols-1 sm:grid-cols-6 md:grid-cols-12 gap-3 items-center">
                    <input
                      value={p.name || ""}
                      onChange={(e) => onUpdateCompanyContact(i, ci, { name: e.target.value })}
                      placeholder="Contact name"
                      className="sm:col-span-6 md:col-span-4 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <input
                      value={p.email || ""}
                      onChange={(e) => onUpdateCompanyContact(i, ci, { email: e.target.value })}
                      placeholder="Contact email"
                      className="sm:col-span-6 md:col-span-5 rounded-lg bg-background border border-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="sm:col-span-6 md:col-span-3 flex justify-end">
                      <button
                        onClick={() => onRemoveCompanyContact(i, ci)}
                        className="p-2 rounded-md hover:bg-background/60 text-muted-foreground"
                        aria-label="Remove contact"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => onAddCompanyContact(i)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border hover:bg-secondary"
                  style={{ borderColor: "#0077D1", color: "#0077D1" }}
                >
                  <Plus className="w-4 h-4" /> Add contact
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => onRemoveRow(i)}
                  className="px-3 py-2 rounded-lg border hover:bg-secondary"
                  style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
                  aria-label="Delete company"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border w-full sm:w-auto hover:bg-secondary"
            style={{ borderColor: "#0077D1", color: "#0077D1" }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <button
            onClick={onAddRow}
            disabled={companies.length >= maxCompanies}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border disabled:opacity-50 w-full sm:w-auto hover:bg-secondary"
            style={{ borderColor: "#0077D1", color: "#0077D1" }}
          >
            <Plus className="w-4 h-4" />
            <span>Add company</span>
          </button>
        </div>
        <button
          onClick={onNext}
          className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-95 w-full sm:w-auto transition-transform active:scale-[0.98]"
          style={{ backgroundColor: "var(--color-turquoise)" }}
        >
          <span>Next</span>
          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          <span
            className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                       bg-white/10 blur-md transform transition-transform duration-500
                       group-hover:translate-x-[260%]"
          />
        </button>
      </div>
    </div>
  );
}
