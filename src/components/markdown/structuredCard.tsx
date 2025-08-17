// src/app/components/markdown/StructuredCard.tsx
"use client";

import React, { useMemo, useState } from "react";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border border-border">
      {children}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        } catch {}
      }}
      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90"
      title="Copy email"
    >
      {copied ? "Copied" : "Copy email"}
    </button>
  );
}

/** Build a friendly contact-like summary from common agent/MCP shapes */
function useContactSummary(data: any) {
  return useMemo(() => {
    // Prefer first item if array
    const obj = Array.isArray(data) ? data[0] : data;
    const msg = obj?.message ?? obj;

    const firstName = msg?.first_name ?? msg?.firstName ?? obj?.first_name ?? obj?.firstName;
    const lastName  = msg?.last_name  ?? msg?.lastName  ?? obj?.last_name  ?? obj?.lastName;
    const name      = msg?.name ?? obj?.name ?? [firstName, lastName].filter(Boolean).join(" ") || undefined;

    const title     = msg?.job_title ?? msg?.title ?? obj?.job_title ?? obj?.title;
    const email     = msg?.email ?? obj?.email ?? msg?.email_address ?? obj?.email_address;
    const status    = msg?.email_status ?? obj?.email_status ?? msg?.status ?? obj?.status;
    const conf      = msg?.match_confidence ?? obj?.match_confidence;

    // common link fields
    const sourceUrl =
      msg?.linkedin_url ??
      obj?.linkedin_url ??
      (typeof msg?.source === "string" && msg.source.startsWith("http") ? msg.source : undefined);

    // pick up a few other useful scalars to show in a simple list
    const extras: Record<string, string> = {};
    const candidates: Array<[string, any]> = Object.entries(msg ?? obj ?? {}).filter(
      ([, v]) => ["string", "number", "boolean"].includes(typeof v)
    );
    for (const [k, v] of candidates) {
      if (
        ["first_name","firstName","last_name","lastName","name","job_title","title","email","email_address","email_status","status","match_confidence","linkedin_url","source"].includes(k)
      ) continue;
      extras[k] = String(v);
    }

    return { name, title, email, status, confidence: conf, sourceUrl, extras };
  }, [data]);
}

export default function StructuredCard({
  data,
  title = "Result",
}: {
  data: any;
  title?: string;
}) {
  const summary = useContactSummary(data);
  const hasAnything =
    !!(summary.name || summary.title || summary.email || summary.status || summary.confidence || summary.sourceUrl) ||
    Object.keys(summary.extras).length > 0;

  if (!hasAnything) return null;

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
        {summary.email ? <CopyButton text={summary.email} /> : null}
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-2">
          {(summary.name || summary.title) && (
            <div className="text-base font-semibold">
              {summary.name ?? "Contact"}
              {summary.title ? <span className="font-normal"> — {summary.title}</span> : null}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {summary.email ? <Badge>{summary.email}</Badge> : null}
            {summary.status ? <Badge>{String(summary.status)}</Badge> : null}
            {typeof summary.confidence === "number" ? (
              <Badge>confidence: {(summary.confidence * 100).toFixed(0)}%</Badge>
            ) : null}
            {summary.sourceUrl ? (
              <a
                className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border hover:bg-border"
                href={summary.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                View source
              </a>
            ) : null}
          </div>
        </div>

        {Object.keys(summary.extras).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(summary.extras).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <div className="text-xs font-medium text-muted-foreground w-28 shrink-0">{k}</div>
                <div className="text-sm break-words">{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
