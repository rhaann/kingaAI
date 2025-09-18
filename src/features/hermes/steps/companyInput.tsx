"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  canProceed: boolean;
  detectedCount: number;
  maxCompanies: number;
  onBack: () => void;
  onParse: () => void;
};

export default function CompanyInput({
  value,
  onChange,
  canProceed,
  detectedCount,
  maxCompanies,
  onBack,
  onParse,
}: Props) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center mb-6">
        <h2 className="text-xl md:text-2xl font-medium tracking-tight mb-1">Enter companies</h2>
        <p className="text-sm text-muted-foreground">Up to {maxCompanies}. Separate each company with a blank line.</p>
      </div>
      <div className="space-y-4">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={10}
          className="w-full rounded-2xl bg-secondary/70 border border-border/30 p-5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 shadow-sm"
          placeholder={`Paste details and separate COMPANIES with a blank line.\nExample (1 company):\nAcme Corp\nacme.com\nJane Doe, jane@acme.com\n\nExample (2 companies):\nAcme Corp\nacme.com\n\nContoso Ltd - https://contoso.com`}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>We’ll parse names, sites, and emails.</span>
          <span className="px-2 py-0.5 rounded-md bg-secondary/80">{detectedCount} detected</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
            style={{ borderColor: "#0077D1", color: "#0077D1" }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          <button
            disabled={!canProceed}
            onClick={onParse}
            className="group relative overflow-hidden inline-flex items-center gap-2 px-5 py-3 rounded-xl text-primary-foreground hover:opacity-95 disabled:opacity-50 transition-transform active:scale-[0.98]"
            style={{ backgroundColor: "var(--color-turquoise)" }}
          >
            <span className="transition-transform group-hover:translate-x-0.5">Parse & Review</span>
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
