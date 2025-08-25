'use client';

import * as React from "react";
import type { KingaCard } from "@/types/types";

// Temporary shim: accept legacy `data` and convert to KingaCard when possible.
function toKingaCard(input: unknown): KingaCard | null {
  if (!input || typeof input !== "object") return null;

  // Already a KingaCard?
  const k = input as any;
  if (Array.isArray(k?.sections)) return k as KingaCard;

  // Legacy flat object -> single section
  const obj = input as Record<string, unknown>;
  const items = Object.entries(obj).map(([label, value]) => ({
    label,
    value: value == null ? "" : String(value),
  }));

  return {
    title: "Result",
    summary: undefined,
    sections: [{ title: undefined, items }],
  };
}

// Turn a card into plain text for clipboard
function cardToPlainText(card: KingaCard): string {
  const lines: string[] = [];
  if (card.title) lines.push(card.title);
  if (card.summary) lines.push(card.summary);
  for (const section of card.sections || []) {
    if (section.title) lines.push(`\n${section.title}`);
    for (const it of section.items || []) {
      lines.push(`${it.label}: ${it.value ?? ""}`);
    }
  }
  return lines.join("\n");
}

type StructuredCardProps = {
  /** New preferred prop */
  card?: KingaCard;
  /** Legacy prop – flat object; will be converted */
  data?: unknown;
  title?: string; // optional override if legacy `data` lacked a title
  frameless?: boolean; // optional: remove the border
};

export default function StructuredCard({
  card,
  data,
  title = "Result",
  frameless
}: StructuredCardProps) {
  const resolved = React.useMemo(() => card ?? toKingaCard(data), [card, data]);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  if (!resolved) return null;

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      // noop
    }
  }

  const { title: cardTitle, summary, sections } = resolved;
  const containerClass = frameless
  ? "p-3 sm:p-4 md:p-5"
  : "rounded-2xl border border-neutral-200/20 bg-neutral-800/60 text-neutral-50 shadow-sm p-6 md:p-7 dark:border-neutral-700/40";



  return (
    <div className={`${containerClass} text-base`}>
      <div className="mb-2 text-lg font-semibold">
        {cardTitle ?? title}
      </div>

      {summary ? (
        <div className="mb-5 text-base text-neutral-300">{summary}</div>
      ) : null}

      <div className="space-y-5">
        {sections?.map((section, idx) => (
          <div key={idx}>
            {section.title ? (
              <div className="mb-2 font-medium text-neutral-200">
                {section.title}
              </div>
            ) : null}
            <dl className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-x-6 gap-y-2">
              {section.items?.map((it, jdx) => {
                const key = `s${idx}-i${jdx}`;
                const isUrl = /^https?:\/\//i.test(it.value);
                return (
                  <React.Fragment key={key}>
                    <dt className="text-neutral-400">{it.label}:</dt>
                    <dd className="break-words relative group min-w-0">
                      {isUrl ? (
                        <a
                          className="underline break-all"
                          href={it.value}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {it.value}
                        </a>
                      ) : (
                        <span className="whitespace-pre-wrap break-words">{it.value}</span>
                      )}

                      {/* Per-row copy (visible on hover) */}
                      <button
                        type="button"
                        onClick={() => copy(String(it.value ?? ""), key)}
                        className="ml-3 inline-flex items-center rounded-md border border-neutral-500/40 px-2 py-0.5 text-xs opacity-0 transition group-hover:opacity-100 hover:border-neutral-400"
                        aria-label={`Copy ${it.label}`}
                        title={`Copy ${it.label}`}
                      >
                        Copy
                      </button>
                      {copiedKey === key ? (
                        <span className="ml-2 text-xs text-neutral-400">Copied</span>
                      ) : null}
                    </dd>
                  </React.Fragment>
                );
              })}
            </dl>
          </div>
        ))}
      </div>

      {/* Copy whole card */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => copy(cardToPlainText(resolved), "card")}
          className="inline-flex items-center rounded-md border border-neutral-500/40 px-3 py-1 text-sm hover:border-neutral-400"
          aria-label="Copy card"
          title="Copy card"
        >
          Copy card
        </button>
        {copiedKey === "card" ? (
          <span className="ml-2 text-xs text-neutral-400 self-center">Copied</span>
        ) : null}
      </div>
    </div>
  );
}
