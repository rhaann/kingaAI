export function buildContinuationPrompt(message: string, envelopes: unknown[]): string {
  const header = [
    "Tool results are provided below.",
    "Continue the user's task. You may call additional tools if needed (e.g., use a LinkedIn /in/ URL from search to call email_finder).",
    "If the task is complete, reply directly to the user in plain text.",
  ].join("\n");
  const body = JSON.stringify(envelopes, null, 2);
  return `${header}\n\n<User request>\n${message}\n</User request>\n\n<Tool results>\n${body}\n</Tool results>`;
}


