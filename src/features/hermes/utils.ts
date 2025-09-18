import type { ParsedCompany } from "./types";

/** Title-case with trimmed spacing. */
export function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

/** Convert a domain or URL into a readable company-like name. */
export function normalizeDomainToName(domain: string): string {
  const clean = domain.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const root = clean.split("/")[0] || clean;
  const noTld = root.replace(/\.[a-z]{2,}$/i, "");
  return toTitleCase(noTld.replace(/[._-]+/g, " "));
}

/**
 * Parse companies from a free-text input.
 * Note: pass maxCompanies explicitly to avoid utils<->constants coupling.
 */
export function parseCompaniesFromInput(raw: string, maxCompanies: number): ParsedCompany[] {
  const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const urlRe = /((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,})(?:\/[\w\-./?%&=]*)?/gi;

  // Split companies by blank lines. This lets users paste multiple lines per company.
  const blocks = raw
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const results: ParsedCompany[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    if (results.length >= maxCompanies) break;

    const emailMatches = Array.from(block.matchAll(emailRe));
    const urls = Array.from(block.matchAll(urlRe)).map((m) => m[1]);

    const lines = block.split(/\n+/).map((l) => l.trim()).filter(Boolean);

    // Build contacts from all emails, infer names from text immediately before each email
    const contacts: Array<{ name?: string; email?: string; title?: string }> = emailMatches.map((m) => {
      const email = m[0];
      const matchIndex = (m as any).index ?? block.indexOf(email);
      const before = block.slice(0, matchIndex);
      const lastChunk = before.split(/[,|\n]/).pop()?.trim() || "";
      let inferredName: string | undefined;
      if (lastChunk.split(/\s+/).length >= 2) inferredName = toTitleCase(lastChunk).slice(0, 120);
      return { name: inferredName, email };
    });
    const firstContact = contacts[0];

    // Choose a company name: first non-email/non-url line; otherwise from domain
    let candidateName = lines.find((l) => !emailRe.test(l) && !urlRe.test(l));
    if (!candidateName && urls[0]) candidateName = normalizeDomainToName(urls[0]);

    const name = toTitleCase(candidateName || "").slice(0, 120);
    const website = urls[0] || undefined;
    const contactEmail = firstContact?.email || undefined;
    const contactName = firstContact?.name || undefined;

    if (!name && !website && !contactEmail) continue;

    const key = `${(name || "").toLowerCase()}|${(website || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ name, website, contactName, contactEmail, contacts });
  }

  // If the user entered text but we found no blank-line blocks, treat the entire input as one company
  if (results.length === 0 && raw.trim()) {
    const emailMatches = Array.from(raw.matchAll(emailRe));
    const urls = Array.from(raw.matchAll(urlRe)).map((m) => m[1]);
    let candidateName = raw
      .replace(emailRe, " ")
      .replace(urlRe, " ")
      .replace(/[|•·•\-–—,:]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (!candidateName && urls[0]) candidateName = normalizeDomainToName(urls[0]);
    const name = toTitleCase(candidateName).slice(0, 120);
    const contacts: Array<{ name?: string; email?: string; title?: string }> = emailMatches.map((m) => {
      const email = m[0];
      const matchIndex = (m as any).index ?? raw.indexOf(email);
      const before = raw.slice(0, matchIndex);
      const lastChunk = before.split(/[,|\n]/).pop()?.trim() || "";
      let inferredName: string | undefined;
      if (lastChunk.split(/\s+/).length >= 2) inferredName = toTitleCase(lastChunk).slice(0, 120);
      return { name: inferredName, email };
    });
    results.push({ name, website: urls[0], contactEmail: emailMatches[0]?.[0], contactName: contacts[0]?.name, contacts });
  }

  return results.slice(0, maxCompanies);
}