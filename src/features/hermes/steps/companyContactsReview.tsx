"use client";

import { Trash2, Plus, ArrowLeft, ArrowRight } from "lucide-react";
import type { Contact } from "@/features/hermes/types";

type Props = {
  companyName: string;
  contacts: Contact[];
  onToggleSelected: (idx: number, selected: boolean) => void;
  onChangeField: (idx: number, field: "name" | "title" | "email", value: string) => void;
  onRemove: (idx: number) => void;
  onAdd: () => void;
  onBack: () => void;
  onNext: () => void;
};

export default function CompanyContactsReview({
  companyName,
  contacts,
  onToggleSelected,
  onChangeField,
  onRemove,
  onAdd,
  onBack,
  onNext,
}: Props) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-medium tracking-tight">Contact selection</h2>
        <div className="text-sm text-muted-foreground">{companyName || "Company"}</div>
      </div>

      <div className="space-y-3">
        {contacts.map((p, idx) => (
          <div
            key={p.id}
            className="grid grid-cols-12 gap-3 bg-secondary/60 rounded-2xl p-4 ring-1 ring-border/40 items-center"
          >
            <div className="col-span-12 sm:col-span-1 flex items-center justify-center">
              <input
                type="checkbox"
                checked={p.selected}
                onChange={(e) => onToggleSelected(idx, e.target.checked)}
              />
            </div>

            <input
              value={p.name}
              onChange={(e) => onChangeField(idx, "name", e.target.value)}
              placeholder="Name"
              className="col-span-12 sm:col-span-3 rounded-lg bg-background border border-transparent px-3 py-2 text-sm"
            />

            <input
              value={p.title}
              onChange={(e) => onChangeField(idx, "title", e.target.value)}
              placeholder="Title"
              className="col-span-12 sm:col-span-3 rounded-lg bg-background border border-transparent px-3 py-2 text-sm"
            />

            <div className="col-span-12 sm:col-span-4 relative">
              <input
                value={p.email}
                onChange={(e) => onChangeField(idx, "email", e.target.value)}
                placeholder="Email"
                className="w-full rounded-lg bg-background border border-transparent px-3 py-2 text-sm pr-9"
              />
              <button
                onClick={() => onRemove(idx)}
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
          onClick={onBack}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
          style={{ borderColor: "#0077D1", color: "#0077D1" }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
            style={{ borderColor: "#0077D1", color: "#0077D1" }}
          >
            <Plus className="w-4 h-4" /> Add contact
          </button>

          <button
            onClick={onNext}
            className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-95 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: "var(--color-turquoise)" }}
          >
            Next
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            <span
              className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                         bg-white/10 blur-md transform transition-transform duration-500
                         group-hover:translate-x-[260%]"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
