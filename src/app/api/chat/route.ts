/**
 * src/app/api/chat/route.ts — minimal chat API with auth, permissions, and logging
 */

import { NextRequest } from "next/server";
import { sendMessage, LLMResult } from "@/lib/sendMessage";
import { AVAILABLE_MODELS } from "@/config/modelConfig";
import type { ModelConfig } from "@/types/types";
import { hardRouteEmailFinder } from "@/lib/tools/router";
import { getUserFromRequest } from "@/services/authRequest";
import { adminDb } from "@/services/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// -------- Helpers --------

// Extract the tool envelope JSON from assistant output
function extractToolEnvelopeFromOutput(output: string) {
  const m = output?.match(/<tool_json[^>]*>([\s\S]*?)<\/tool_json>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// Returns true/false for users/{uid}/toolPermissions/{toolId}.enabled
async function isToolEnabled(userId: string, toolId: string) {
  try {
    const snap = await adminDb.doc(`users/${userId}/toolPermissions/${toolId}`).get();
    return Boolean(snap.exists && (snap.data() as any)?.enabled === true);
  } catch {
    return false;
  }
}

// Unique id for a run log
function runId() {
  return (globalThis as any).crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

// Generic logger for non-tool runs (and errors)
async function logGenericRun(opts: {
  userId: string;
  chatId?: string | null;
  kind: "llm" | "built_in" | "error";
  status: "ok" | "error";
  toolId?: string | null;
  latencyMs?: number | null;
  note?: string | null;
}) {
  const id = runId();
  await adminDb.doc(`users/${opts.userId}/runs/${id}`).set({
    traceId: id,
    userId: opts.userId,
    chatId: opts.chatId ?? null,
    kind: opts.kind,
    status: opts.status,
    toolId: opts.toolId ?? null,
    latencyMs: opts.latencyMs ?? null,
    note: opts.note ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// Write one run log if a tool envelope is present in output
async function logToolRun(opts: { userId: string; chatId?: string | null; output: string }) {
  const env = extractToolEnvelopeFromOutput(opts.output || "");
  if (!env || !env.toolId) return;

  const traceId = runId();
  await adminDb.doc(`users/${opts.userId}/runs/${traceId}`).set({
    traceId,
    userId: opts.userId,
    chatId: opts.chatId ?? null,
    toolId: env.toolId,
    version: env.version ?? null,
    status: env.status ?? null,
    latencyMs: env.meta?.latencyMs ?? null,
    source: env.meta?.source ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// -------- Handler --------

export async function POST(req: NextRequest) {
  // capture chatId for error logging even if parsing/logic fails later
  let chatId: string | null = null;

  try {
    const body = await req.json();
    const {
      message,
      modelConfig,
      conversationHistory,
      documentContext,
      currentArtifactId,
      currentArtifactTitle,
    } = body ?? {};
    chatId = body?.chatId ?? null;

    if (!message || typeof message !== "string") {
      return new Response("Message is required", { status: 400 });
    }

    // [AUTH] Require a signed-in user
    const user = await getUserFromRequest();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    const userId = user.uid;
    const startedAt = Date.now();

    // 1) Hard route: Email Finder (permission-gated)
    const needsEmailFinder = /linkedin\.com\/in\//i.test(message || "");
    if (needsEmailFinder) {
      const allowed = await isToolEnabled(userId, "email_finder");
      if (!allowed) {
        return Response.json({
          result: { output: "You don’t have access to the Email Finder tool." },
        });
      }
    }
    const routed = await hardRouteEmailFinder(message, conversationHistory);
    if (routed?.handled) {
      try {
        await logToolRun({ userId, chatId, output: routed.output });
      } catch (e) {
        console.error("[runs.log] hard-route write failed:", e);
      }
      return Response.json({
        result: {
          output: routed.output,
          card: routed.card,
          suggestedTitle: routed.suggestedTitle,
        },
      });
    }

    // 2) Ask the LLM
    const selectedModelConfig: ModelConfig =
      modelConfig && (modelConfig as any).provider ? modelConfig : AVAILABLE_MODELS[2];

    const llm: LLMResult = await sendMessage(message, {
      modelConfig: selectedModelConfig,
      conversationHistory,
      documentContext,
    });

    // 3) Plain text reply
    if (llm.type === "text") {
      try {
        await logGenericRun({
          userId,
          chatId,
          kind: "llm",
          status: "ok",
          latencyMs: Date.now() - startedAt,
        });
      } catch (e) {
        console.error("[runs.log] llm text log failed:", e);
      }

      return Response.json({
        result: { output: llm.content || "I'm sorry, I couldn't generate a response." },
      });
    }

    // 4) Tool calls (built-ins + parameter guard)
    if (llm.type === "tool_call") {
      const { toolName, toolArgs } = llm;

      // External email_finder guard — do not run without required params
      if (toolName === "email_finder") {
        const allowed = await isToolEnabled(userId, "email_finder");
        if (!allowed) {
          return Response.json({
            result: { output: "You don’t have access to the Email Finder tool." },
          });
        }

        const linkedin_url = String(toolArgs?.linkedin_url || "").trim();
        if (!linkedin_url) {
          return Response.json({
            result: {
              output:
                "Please paste a LinkedIn profile URL (for example: https://www.linkedin.com/in/username/) so I can look up the email.",
            },
          });
        }
        // We hard-route Email Finder; if the LLM asks here, nudge the user.
        return Response.json({
          result: {
            output:
              "Thanks! Please send that same request again (the assistant will run Email Finder automatically when a LinkedIn /in/ URL is included).",
          },
        });
      }

      // Built-in: create_document
      if (toolName === "create_document") {
        const { title, content } = toolArgs || {};
        if (!title || !content) {
          return Response.json({
            result: { output: "Please provide both a title and content to create a document." },
          });
        }
        const now = Date.now();
        try {
          await logGenericRun({
            userId,
            chatId,
            kind: "built_in",
            status: "ok",
            toolId: "create_document",
            latencyMs: Date.now() - startedAt,
          });
        } catch (e) {
          console.error("[runs.log] create_document log failed:", e);
        }
        return Response.json({
          result: {
            output: `I've created a document for you: "${title}"`,
            artifact: {
              id: `artifact-${now}`,
              title,
              type: "document",
              versions: [{ content, createdAt: now }],
              createdAt: now,
              updatedAt: now,
            },
            suggestedTitle: title,
          },
        });
      }

      // Built-in: update_document
      if (toolName === "update_document") {
        if (!currentArtifactId || !currentArtifactTitle) {
          return Response.json({
            result: {
              output:
                "I need to know which document is open to update it. Please open a document and try again.",
            },
          });
        }
        const { content } = toolArgs || {};
        if (!content) {
          return Response.json({
            result: { output: "Please provide the new, complete content to update the document." },
          });
        }
        const now = Date.now();
        try {
          await logGenericRun({
            userId,
            chatId,
            kind: "built_in",
            status: "ok",
            toolId: "update_document",
            latencyMs: Date.now() - startedAt,
          });
        } catch (e) {
          console.error("[runs.log] update_document log failed:", e);
        }
        return Response.json({
          result: {
            output: "I've updated the document for you.",
            artifact: {
              id: currentArtifactId,
              title: currentArtifactTitle,
              type: "document",
              versions: [{ content, createdAt: now }],
              updatedAt: now,
            },
            suggestedTitle: currentArtifactTitle,
          },
        });
      }

      // Unknown tool name (not wired)
      return Response.json({
        result: {
          output: `That tool ('${toolName}') isn't available here yet. Tell me what you need and I’ll help directly.`,
        },
      });
    }

    return new Response("Invalid result type from sendMessage service.", { status: 500 });
  } catch (err: any) {
    console.error("Error in /api/chat:", err?.stack || err);
    try {
      const maybeUser = await getUserFromRequest();
      if (maybeUser?.uid) {
        await logGenericRun({
          userId: maybeUser.uid,
          chatId, // captured earlier
          kind: "error",
          status: "error",
          toolId: null,
          latencyMs: null,
          note: String(err?.message || err),
        });
      }
    } catch {}
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
