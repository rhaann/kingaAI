"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

type Props = {
  companyName: string;
  website?: string;
  currentIndex: number; // 0-based
  total: number;
  onBack: () => void;
  onHold: () => void;
  onDelete: () => void;
  onNext: () => void;
};

export default function CompanyResearch({
  companyName,
  website,
  currentIndex,
  total,
  onBack,
  onHold,
  onDelete,
  onNext,
}: Props) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-medium tracking-tight">Company Research</h2>
        <div className="px-2 py-1 rounded-md text-xs bg-secondary text-muted-foreground">
          {Math.min(currentIndex + 1, total)}/{total}
        </div>
      </div>

      {total === 0 ? (
        <div className="text-sm text-muted-foreground">No companies to research.</div>
      ) : (
        <div className="rounded-2xl ring-1 ring-border/40 bg-secondary/60 p-5 md:p-6 space-y-4">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">Company</div>
            <div className="text-lg font-semibold">{companyName || "Unnamed"}</div>
          </div>

          <div className="text-sm text-muted-foreground leading-relaxed">
            {/* Placeholder research summary */}
            This is a placeholder research summary for the selected company. In a future step, this will
            include industry, size, geography, and relevant notes gathered from enrichment sources.
          </div>

          <div className="flex items-center gap-3">
            <input
              value={website || ""}
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
              onClick={onBack}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
              style={{ borderColor: "#0077D1", color: "#0077D1" }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onHold}
                className="px-5 py-2.5 rounded-xl border bg-secondary text-foreground hover:bg-secondary/80"
              >
                Hold
              </button>
              <button
                onClick={onDelete}
                className="px-5 py-2.5 rounded-xl text-white hover:opacity-90"
                style={{ backgroundColor: "var(--color-sharp-orange)" }}
              >
                Delete
              </button>
              <button
                onClick={onNext}
                className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-95 transition-transform active:scale-[0.98]"
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
        </div>
      )}
    </div>
  );
}
