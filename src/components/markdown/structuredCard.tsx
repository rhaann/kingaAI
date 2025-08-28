'use client';

import * as React from "react";
import type { KingaCard } from "@/types/types";


function toKingaCard(input: unknown): KingaCard | null {
  if (input === null || typeof input !== "object") return null;

  // Already a KingaCard? (has a sections array)
  if ("sections" in input && Array.isArray((input as { sections?: unknown }).sections)) {
    return input as KingaCard;
  }

  // Convert a plain object into a simple KingaCard
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
  ? "p-3 sm:p-4 md:p-5 text-foreground"
  : "rounded-2xl border bg-card text-card-foreground border-border shadow-sm p-6 md:p-7";



  return (
    <div className={`${containerClass} text-base`}>
      <div className="mb-2 text-lg font-semibold">
        {cardTitle ?? title}
      </div>

      {summary ? (
        <div className="mb-5 text-base text-muted-foreground">{summary}</div>
      ) : null}

      <div className="space-y-5">
        {sections?.map((section, idx) => (
          <div key={idx}>
            {section.title ? (
              <div className="mb-2 font-medium text-foreground">
                {section.title}
              </div>
            ) : null}
            <dl className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-x-6 gap-y-2">
              {section.items?.map((it, jdx) => {
                const key = `s${idx}-i${jdx}`;
                const isUrl = /^https?:\/\//i.test(it.value);
                return (
                  <React.Fragment key={key}>
                    <dt className="text-muted-foreground">{it.label}:</dt>
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
                        className="ml-3 inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs opacity-0 transition group-hover:opacity-100 hover:border-foreground/40"
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
