
/** Try to parse a string as JSON, handling common fence/escape cases */
export function tryParseJSON(raw?: string | null) {
    if (!raw) return null;
    try {
      const cleaned = raw
        .trim()
        .replace(/^\uFEFF/, "")       // strip BOM
        .replace(/^```json\s*/i, "")  // remove ```json
        .replace(/^```\s*/i, "")      // remove ``` (generic)
        .replace(/```$/i, "")         // trailing ```
        .trim();
      return JSON.parse(cleaned);
    } catch {
      try {
        return JSON.parse(raw as string);
      } catch {
        return null;
      }
    }
  }
  
  export type JsonBlock = { jsonText: string; start: number; end: number };
  
  /** Find ALL fenced code blocks (for rendering) */
  export function findAllCodeFences(text: string) {
    const fences: Array<{ lang?: string; code: string; start: number; end: number }> = [];
    const regex = /```(\w+)?\s*([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text))) {
      fences.push({
        lang: m[1]?.toLowerCase(),
        code: m[2],
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    return fences;
  }
  
  /** Find the first block that parses as JSON: ```json```, any fenced valid JSON, or whole-message JSON */
  export function findFirstJsonBlock(text: string): JsonBlock | null {
    // Prefer explicit ```json
    const jsonFence = /```json\s*([\s\S]*?)```/i.exec(text);
    if (jsonFence?.[1]) {
      return { jsonText: jsonFence[1], start: jsonFence.index!, end: jsonFence.index! + jsonFence[0].length };
    }
  
    // Any fenced block that happens to be JSON
    const all = findAllCodeFences(text);
    const candidate = all.find((f) => !!tryParseJSON(f.code));
    if (candidate) {
      return { jsonText: candidate.code, start: candidate.start, end: candidate.end };
    }
  
    // Whole message might be JSON
    const direct = tryParseJSON(text);
    if (direct) return { jsonText: text, start: 0, end: text.length };
  
    return null;
  }
  
  /** Sometimes tools return JSON INSIDE fields like message.content (as a string). Try to pull that out. */
  export function pluckEmbeddedJson(obj: any): any | null {
    if (!obj || typeof obj !== "object") return null;
  
    // Search shallow fields for JSON-looking strings
    for (const [, v] of Object.entries(obj)) {
      if (typeof v === "string") {
        const parsed = tryParseJSON(v);
        if (parsed) return parsed;
      }
      if (v && typeof v === "object") {
        const nested = pluckEmbeddedJson(v);
        if (nested) return nested;
      }
    }
    return null;
  }
  