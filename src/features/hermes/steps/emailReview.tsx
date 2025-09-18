"use client";

import { ArrowLeft } from "lucide-react";
import type { Contact } from "@/features/hermes/types";

type Props = {
  companyName: string;
  selectedContacts: Contact[];
  currentIndex: number; // 0-based within selectedContacts
  draft: { subject: string; body: string };
  onChangeSubject: (v: string) => void;
  onChangeBody: (v: string) => void;

  improveNotes: string;
  onChangeImproveNotes: (v: string) => void;
  onApplyImproveNotes: () => void;

  onBackToContacts: () => void;
  onHold: () => void;
  onNextOrSend: () => void;
};

export default function EmailReview({
  companyName,
  selectedContacts,
  currentIndex,
  draft,
  onChangeSubject,
  onChangeBody,
  improveNotes,
  onChangeImproveNotes,
  onApplyImproveNotes,
  onBackToContacts,
  onHold,
  onNextOrSend,
}: Props) {
  const total = selectedContacts.length;
  const cur = selectedContacts[currentIndex] || selectedContacts[0];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-medium tracking-tight">Email generation</h2>
        <div className="text-sm text-muted-foreground">
          {total > 0 ? `${Math.min(currentIndex + 1, total)}/${total}` : "0/1"}
        </div>
      </div>

      {total === 0 || !cur ? (
        <div className="text-sm text-muted-foreground">
          No contacts selected. Go back and choose at least one.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <div className="rounded-2xl ring-1 ring-border/40 bg-secondary/60 p-5 md:p-6 space-y-3 flex flex-col">
              <div className="text-xs text-muted-foreground">Sending to</div>
              <div className="text-sm text-foreground">
                {cur.name || cur.email || "Recipient"}
                {cur.title ? <span className="text-muted-foreground"> — {cur.title}</span> : null}
              </div>
              <div className="text-xs text-muted-foreground">{cur.email}</div>

              <input
                value={draft.subject}
                onChange={(e) => onChangeSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-lg bg-background border border-transparent px-3 py-2 text-sm"
              />

              <textarea
                value={draft.body}
                onChange={(e) => onChangeBody(e.target.value)}
                rows={12}
                placeholder="Write your email..."
                className="w-full rounded-lg bg-background border border-transparent px-3 py-2 text-sm min-h-[300px] flex-1"
              />

              <div className="flex justify-end mt-auto">
                <button
                  onClick={onNextOrSend}
                  className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-95 transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: "var(--color-turquoise)" }}
                >
                  Send
                  <span
                    className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                               bg-white/10 blur-md transform transition-transform duration-500
                               group-hover:translate-x-[260%]"
                  />
                </button>
              </div>
            </div>

            <div className="rounded-2xl ring-1 ring-border/40 bg-secondary/60 p-5 md:p-6 space-y-4 flex flex-col">
              <label className="text-sm font-medium text-muted-foreground">Improve with notes</label>
              <textarea
                value={improveNotes}
                onChange={(e) => onChangeImproveNotes(e.target.value)}
                rows={12}
                placeholder="Tell Hermes how to refine the email (tone, points, CTA, etc.)"
                className="mt-2 mb-3 w-full rounded-lg bg-background border border-transparent px-3 py-2 text-sm min-h-[300px] flex-1"
              />
              <div className="flex justify-end">
                <button
                  onClick={onApplyImproveNotes}
                  className="group relative overflow-hidden inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-primary-foreground hover:opacity-95 transition-transform active:scale-[0.98]"
                  style={{ backgroundColor: "var(--color-turquoise)" }}
                >
                  Apply
                  <span
                    className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                               bg-white/10 blur-md transform transition-transform duration-500
                               group-hover:translate-x-[260%]"
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-16 md:mt-24">
            <button
              onClick={onBackToContacts}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border hover:bg-secondary"
              style={{ borderColor: "#0077D1", color: "#0077D1" }}
            >
              <ArrowLeft className="w-4 h-4" /> Contacts
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onHold}
                className="px-5 py-2.5 rounded-xl border bg-secondary text-foreground hover:bg-secondary/80"
              >
                Hold
              </button>
              <button
                onClick={onNextOrSend}
                className="group relative overflow-hidden inline-flex items-center gap-2 px-6 py-3 rounded-xl text-primary-foreground hover:opacity-95 transition-transform active:scale-[0.98]"
                style={{ backgroundColor: "var(--color-turquoise)" }}
              >
                Next
                <span
                  className="pointer-events-none absolute left-[-120%] top-0 h-full w-1/2
                             bg-white/10 blur-md transform transition-transform duration-500
                             group-hover:translate-x-[260%]"
                />
              </button>
            </div>
          </div>
          <div className="mt-8 md:mt-12" />
        </div>
      )}
    </div>
  );
}
