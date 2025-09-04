import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/services/authRequest";

/* ---------- helpers ---------- */

function autoTitleFrom(text: string): string {
  const cleaned = String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "New chat";
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
}

// very simple intent check
// function wantsEmail(msg: string): boolean {
//   const m = msg.toLowerCase();
//   return /\b(send\s+email|email\s+(the\s+)?person|email\s+(them|him|her))\b/.test(m);
// }

function wantsEmail(msg: string): boolean {
  const m = msg.toLowerCase().trim();

  // If the user is just giving an address, that's not an action
  if (/@/.test(m) && /\b(email\s+is|my\s+email|their\s+email)\b/.test(m)) return false;

  // Action intent: allow words between the verb and "email"
  return /\b(send|draft|write|compose)\b.*\bemail\b|\bemail\b.*\b(him|her|them|me|us|person|team)\b/i.test(m);
}


// turn any n8n response into a chat string
function coerceReply(n8n: unknown): string {
  if (typeof n8n === "string") return n8n;

  if (Array.isArray(n8n)) {
    const first = n8n[0];
    if (typeof first === "string") return first;
    return JSON.stringify(first ?? n8n, null, 2);
  }

  if (n8n && typeof n8n === "object") {
    const o = n8n as Record<string, unknown>;
    if (typeof o.reply === "string") return o.reply;
    if (o.reply && typeof o.reply === "object") return JSON.stringify(o.reply, null, 2);

    // Build a readable markdown summary for “person profile” style objects
    const lower: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) lower[k.toLowerCase()] = v;

    const lines = [
      lower.name ? `**${lower.name}**` : null,
      lower.linkedin ? `LinkedIn: ${lower.linkedin}` : null,
      lower.email ? `Email: ${lower.email}` : null,
      lower.background ? `Background: ${lower.background}` : null,
      (lower["current company"] ?? o["Current Company"])
        ? `Current Company: ${lower["current company"] ?? o["Current Company"]}`
        : null,
      (lower["company description"] ?? o["Company Description"])
        ? `Company Description: ${lower["company description"] ?? o["Company Description"]}`
        : null,
      (lower["company linkedin"] ?? o["Company LinkedIn"])
        ? `Company LinkedIn: ${lower["company linkedin"] ?? o["Company LinkedIn"]}`
        : null,
      (lower["company website"] ?? o["Company Website"])
        ? `Company Website: ${lower["company website"] ?? o["Company Website"]}`
        : null,
      lower.source ? `Sources: ${lower.source}` : null,
    ].filter(Boolean);

    if (lines.length) return lines.join("\n");
    return JSON.stringify(o, null, 2);
  }

  return "No response from the workflow.";
}

// extract a “context” object we can hand back to the client for the next turn
function extractContext(n8n: unknown): unknown | undefined {
  if (!n8n || typeof n8n !== "object") return undefined;
  const o = n8n as Record<string, unknown>;
  if (o.context && typeof o.context === "object") return o.context;
  // if there is no explicit reply field, assume the whole object is the context
  if (!("reply" in o)) return o;
  return undefined;
}

/* ---------- route ---------- */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const message: string = String(body.message ?? "");
    const chatId: string | null =
      (typeof body.chatId === "string" && body.chatId) ||
      (typeof body.conversationId === "string" && body.conversationId) ||
      null;

    if (!message) {
      return NextResponse.json(
        { result: { output: "Message is required.", suggestedTitle: "New chat" } },
        { status: 200 }
      );
    }

    // auth required
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json(
        { result: { output: "Unauthorized. Please sign in.", suggestedTitle: "New chat" } },
        { status: 200 }
      );
    }

    if (!chatId) {
      return NextResponse.json(
        {
          result: {
            output: "No conversationId/chatId found for this chat.",
            suggestedTitle: autoTitleFrom(message),
          },
        },
        { status: 200 }
      );
    }

    const WF1_URL = process.env.N8N_CHAT_WEBHOOK;   // research workflow (returns JSON profile)
    const WF2_URL = process.env.N8N_EMAIL_WEBHOOK;  // email workflow (sends email)
    if (!WF1_URL) {
      return NextResponse.json(
        { result: { output: "n8n webhook is not configured.", suggestedTitle: "New chat" } },
        { status: 200 }
      );
    }
    const isSearch = /\b(search|find|lookup|research)\b/i.test(message);
    const sendEmail = !isSearch && wantsEmail(message);
    console.log("[chat-n8n] msg:", message, { isSearch, sendEmail });
    // const sendEmail = wantsEmail(message);

    // If user asked to email, we need the context (profile) from the previous turn.
    // Expect the client to pass it back as `context` (whatever WF1 returned).
    const incomingContext = body.context ?? null;

    if (sendEmail) {
      if (!WF2_URL) {
        return NextResponse.json(
          { result: { output: "Email workflow is not configured.", suggestedTitle: autoTitleFrom(message) } },
          { status: 200 }
        );
      }
      // Reject when context is missing or empty object/array (prevent sending {})
      const contextIsEmpty =
        incomingContext == null ||
        (typeof incomingContext === "object" && Object.keys(incomingContext as Record<string, unknown>).length === 0) ||
        (Array.isArray(incomingContext) && incomingContext.length === 0);

      if (contextIsEmpty) {
        return NextResponse.json(
          {
            result: {
              output:
                "I need the contact details to email them. Ask me to research the person first (so I can capture their info), or pass the context with your request.",
              suggestedTitle: autoTitleFrom(message),
            },
          },
          { status: 200 }
        );
      }

      // Call Workflow-2 with the profile/context
      const res = await fetch(WF2_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: chatId,
          userId: user.uid,
          message,           // “send email …”
          profile: incomingContext, // full JSON from WF1
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return NextResponse.json(
          {
            result: {
              output: "The email workflow did not respond successfully.",
              suggestedTitle: autoTitleFrom(message),
              error: t || `${res.status} ${res.statusText}`,
            },
          },
          { status: 200 }
        );
      }

      const n8n = (await res.json().catch(() => ({}))) as unknown;
      const reply = coerceReply(n8n);

      return NextResponse.json({
        result: {
          output: reply,
          suggestedTitle: autoTitleFrom(message),
        },
      });
    }

    // Otherwise: call Workflow-1 (research) and return its JSON + a readable summary
    const res = await fetch(WF1_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: chatId,
        userId: user.uid,
        message,
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json(
        {
          result: {
            output: "The chat workflow did not respond successfully. Please try again.",
            suggestedTitle: autoTitleFrom(message),
            error: t || `${res.status} ${res.statusText}`,
          },
        },
        { status: 200 }
      );
    }

    // Accept json or text bodies
    let n8n: unknown;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      n8n = await res.json().catch(() => ({}));
    } else {
      const txt = await res.text().catch(() => "");
      try { n8n = JSON.parse(txt); } catch { n8n = txt; }
    }

    const reply = coerceReply(n8n);
    const contextOut = extractContext(n8n) ?? (typeof n8n === "object" ? n8n : undefined);

    return NextResponse.json({
      result: {
        output: reply,              // nice markdown summary
        context: contextOut,        // <-- full JSON so the client can pass it back later
        suggestedTitle: autoTitleFrom(message),
      },
    });
  } catch (err: unknown) {
    console.error("[/api/chat-n8n] error:", err);
    return NextResponse.json(
      {
        result: {
          output: "Something went wrong while contacting the workflow.",
          suggestedTitle: "New chat",
        },
      },
      { status: 200 }
    );
  }
}
