type HeadersInitLike = Record<string, string>;

type MCPRequest = {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

type MCPResult =
  | { jsonrpc: "2.0"; id: string; result: any }
  | { jsonrpc: "2.0"; id: string | null; error: { code: number; message: string } };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Open the SSE stream and return:
 * - the session URL to POST JSON-RPC requests
 * - an async iterator yielding parsed SSE {event, data} objects
 */
export async function openSSESession(baseUrl: string, extraHeaders: HeadersInitLike, abort: AbortController) {
  const res = await fetch(baseUrl, {
    method: "GET",
    headers: {
      Accept: "text/event-stream, application/json",
      ...extraHeaders,
    },
    signal: abort.signal,
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to open SSE (${res.status}): ${body}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let sessionUrl: string | null = null;

  async function* events() {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Split into SSE "events" (double newline separates events)
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        // Parse lines like: "event: message" / "data: {...}"
        let ev = "message";
        let data = "";
        for (const line of chunk.split(/\r?\n/)) {
          if (line.startsWith("event:")) ev = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }

        // First event from n8n is "endpoint" with the session path
        if (!sessionUrl && ev === "endpoint" && data) {
          // data is a path like /mcp/kinga-base-mcp?sessionId=...
          const url = new URL(data, baseUrl);
          sessionUrl = url.toString();
        }

        yield { event: ev, data };
      }
    }
  }

  // Wait briefly for the endpoint event to populate sessionUrl
  const it = events();
  for await (const e of it) {
    if (e.event === "endpoint") break;
  }
  if (!sessionUrl) throw new Error("No session URL received from SSE endpoint.");

  // Re-create iterator so caller can consume all subsequent events (including results)
  const stream = events();
  return { sessionUrl, stream };
}

/** POST a JSON-RPC payload to the session URL */
async function postJSONRPC(sessionUrl: string, body: MCPRequest, extraHeaders: HeadersInitLike) {
  const res = await fetch(sessionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  // Server may return 200 with empty body; actual result arrives via SSE stream.
  // Still surface HTTP errors early:
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`MCP POST ${body.method} failed (${res.status}): ${txt}`);
  }
}

/**
 * Call a single MCP tool and resolve with its JSON-RPC result.
 * - Opens SSE
 * - Sends tools/call
 * - Waits for matching id on the SSE stream
 */
export async function callMCPToolSSE(opts: {
  baseUrl: string;
  headers: HeadersInitLike;
  toolName: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<MCPResult> {
  const { baseUrl, headers, toolName, args, timeoutMs = 20000 } = opts;

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort("SSE timeout"), timeoutMs);

  try {
    const { sessionUrl, stream } = await openSSESession(baseUrl, headers, abort);

    const id = `kinga-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Fire the JSON-RPC call (do not await SSE before posting)
    await postJSONRPC(sessionUrl, {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }, headers);

    // Wait for matching id in SSE stream
    for await (const evt of stream as AsyncIterable<{ event: string; data: string }>) {
      if (evt.event !== "message" || !evt.data) continue;
      let payload: MCPResult | null = null;
      try {
        payload = JSON.parse(evt.data) as MCPResult;
      } catch {
        continue;
      }
      if ("id" in payload && payload.id === id) {
        return payload;
      }
    }

    throw new Error("SSE stream ended before receiving a matching result.");
  } finally {
    clearTimeout(timeout);
    try {
      abort.abort(); // close SSE
    } catch {}
    await sleep(10);
  }
}
