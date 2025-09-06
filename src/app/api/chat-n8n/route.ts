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

    const WF1_URL = process.env.N8N_CHAT_WEBHOOK;   // single workflow (returns JSON/profile)
    if (!WF1_URL) {
      return NextResponse.json(
        { result: { output: "n8n webhook is not configured.", suggestedTitle: "New chat" } },
        { status: 200 }
      );
    }
    // Call the single workflow and return its JSON + a readable summary
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
