export type ToolEnvelope = {
    toolId: string;
    version: "1.0";
    status: "ok" | "error";
    summary: string;
    data: Record<string, unknown>;
    meta?: { durationMs?: number; source?: string[] };
  };
  
  type EmailFinderRecord = {
    first_name?: string;
    last_name?: string;
    email?: string;
    email_status?: string;
    title?: string;
    headline?: string;
    linkedin_url?: string;
    photo_url?: string;
    employment_history?: string | unknown[];
  };
  
  function safeJSON(v: unknown) {
    try { return typeof v === "string" ? JSON.parse(v) : v; } catch { return null; }
  }
  
  function parseEmployment(eh: EmailFinderRecord["employment_history"]) {
    if (!eh) return [];
    if (Array.isArray(eh)) return eh;
    const parsed = safeJSON(eh);
    if (Array.isArray(parsed)) {
      return parsed.map(e => ({
        organization_name: e.organization_name ?? "",
        title: e.title ?? "",
        start_date: e.start_date ?? "",
        end_date: e.end_date ?? "",
        current: !!e.current,
      }));
    }
    return [];
  }
  
  export function adaptEmailFinder(raw: unknown): ToolEnvelope | null {
    const arr = Array.isArray(raw) ? raw : [];
    if (!arr.length) return null;
    const rec: EmailFinderRecord = (arr[0] ?? {}) as EmailFinderRecord;
  
    const data = {
      first_name: rec.first_name ?? "",
      last_name: rec.last_name ?? "",
      email: rec.email ?? "",
      email_status: rec.email_status ?? "",
      title: rec.title ?? rec.headline ?? "",
      headline: rec.headline ?? "",
      linkedin_url: rec.linkedin_url ?? "",
      photo_url: rec.photo_url ?? "",
      employment_history: parseEmployment(rec.employment_history),
    };
  
    const summary = data.email ? "Found email." : "Profile found; no email.";
    return {
      toolId: "email_finder",
      version: "1.0",
      status: "ok",
      summary,
      data,
      meta: { source: [data.linkedin_url as string].filter(Boolean) as string[] },
    };
  }
  