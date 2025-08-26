import type { NextRequest } from "next/server";

// Force Node runtime (not edge) so we can hold open connections.
export const runtime = "nodejs";

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

type ParsedEvent = { event?: string; data?: string };

function parseSSEChunk(chunk: string): ParsedEvent | null {
  // Very small parser for lines like:
  // event: message\n
  // data: {...}\n\n
  const lines = chunk.split("\n");
  const out: ParsedEvent = {};
  for (const line of lines) {
    if (line.startsWith("event:")) out.event = line.slice(6).trim();
    if (line.startsWith("data:")) out.data = line.slice(5).trim();
  }
  return out.event || out.data ? out : null;
}

export async function GET(req: NextRequest) {
  try {
    // Query params: tool (string), args (json-encoded string)
    const tool = req.nextUrl.searchParams.get("tool");
    const argsStr = req.nextUrl.searchParams.get("args") || "{}";
    const args = JSON.parse(argsStr);

    if (!tool) {
      return new Response("Missing ?tool=", { status: 400 });
    }

    // Pull your n8n MCP endpoint + auth header from toolsConfig envs
    const baseUrl = process.env.N8N_MCP_BASE_URL; // e.g. https://actualinsight.app.n8n.cloud/mcp/kinga-base-mcp
    const authHeaderName = process.env.N8N_AUTH_HEADER_NAME || "kinga_key";
    const authHeaderValue = process.env.N8N_AUTH_HEADER_VALUE || "";

    if (!baseUrl || !authHeaderValue) {
      return new Response("MCP credentials not configured", { status: 500 });
    }

    // We return a streaming response to the browser
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const write = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`)
          );
        };

        // 1) Connect to MCP SSE base to get sessionId + endpoint
        const sseResp = await fetch(baseUrl, {
          method: "GET",
          headers: {
            Accept: "text/event-stream, application/json",
            [authHeaderName]: authHeaderValue,
          },
        });

        if (!sseResp.ok || !sseResp.body) {
          write("error", { message: "Failed to open MCP SSE session" });
          controller.close();
          return;
        }

        // 2) As soon as we receive the "endpoint" event, POST tools/call
        const reader = sseResp.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";

        const postToolCall = async (sessionPath: string) => {
          const url = new URL(sessionPath, baseUrl).toString();

          // Fire the tool call (no need to await streaming here)
          await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
              [authHeaderName]: authHeaderValue,
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: "stream-1",
              method: "tools/call",
              params: { name: tool, arguments: args },
            }),
          }).catch(() => {
            // errors here will surface via SSE error events anyway
          });
        };

        // 3) Pump MCP SSE, forward deltas
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffered += decoder.decode(value, { stream: true });

            // Split on double-newline between SSE events
            const parts = buffered.split("\n\n");
            buffered = parts.pop() || "";

            for (const part of parts) {
              const evt = parseSSEChunk(part);
              if (!evt) continue;

              if (evt.event === "endpoint" && evt.data) {
                // Kick off tools/call to the session endpoint we just got
                await postToolCall(evt.data);
                write("info", "started");
                continue;
              }

              if (evt.event === "message" && evt.data) {
                // N8n MCP sends JSON RPC envelopes; try to pull text
                try {
                  const payload = JSON.parse(evt.data);
                  const text =
                    payload?.result?.content?.[0]?.text ??
                    payload?.params?.message?.content ?? // some servers
                    payload?.result?.output ??
                    "";

                  if (text) {
                    // Stream a delta to the browser
                    write("delta", text);
                  }
                } catch {
                  // If parsing fails, forward raw chunk
                  write("delta", evt.data);
                }
                continue;
              }

              if (evt.event === "error") {
                write("error", evt.data ?? "tool error");
              }
            }
          }

          write("done", "ok");
          controller.close();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err ?? "stream failed");
          write("error", msg);
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: sseHeaders() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err ?? "");
    return new Response(`stream failed: ${msg}`, { status: 500 });
  }
}
