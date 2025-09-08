export function buildTitlePrompt(message: string, toolSummary?: string) {
  const toolPart = toolSummary ? `\n\nTool summary:\n${toolSummary}` : "";
  return (
    "Generate a concise, descriptive chat title (max 6 words). " +
    "Output ONLY the title with no quotes or punctuation.\n\n" +
    `User request:\n${message}${toolPart}`
  );
}


