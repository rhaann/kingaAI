// src/lib/smartArtifacts.ts

import { generateSmartTitle } from "./smartTitles"; // Import the title generator

/**
 * A simpler, more robust function to decide if an artifact should be created.
 * @param userMessage The user's original message.
 * @param aiResponse The AI's generated response.
 * @returns An object indicating if an artifact should be created and what its title should be.
 */
export function smartShouldCreateArtifact(userMessage: string, aiResponse: string): {
  shouldCreate: boolean;
  title: string;
} {
  const prompt = userMessage.toLowerCase();
  const response = aiResponse.toLowerCase();

  // --- VETO RULE ---
  // First, check if the AI is just asking a question. If so, never create an artifact.
  const questionWords = /\b(what|could you|need more|to tailor|provide me with|for example|specify)\b/i;
  if (questionWords.test(response) || response.trim().endsWith('?')) {
    console.log("Artifact VETO: AI is asking a clarifying question.");
    return { shouldCreate: false, title: "" };
  }

  // --- POSITIVE INTENT RULE ---
  // Next, check if the user's prompt clearly indicates they want a document.
  const creationIntent = /\b(create|write|generate|make|draft|compose|explain|give me)\b/i.test(prompt);
  const documentIntent = /\b(document|email|report|article|guide|list|plan|summary|explanation)\b/i.test(prompt);

  if (creationIntent && documentIntent) {
    console.log("Artifact CREATED: User intent was explicit.");
    // If the intent is clear, we create the artifact and generate a smart title for it.
    const title = generateSmartTitle(userMessage, aiResponse);
    return { shouldCreate: true, title: title };
  }
  
  // --- FALLBACK RULE ---
  // If the user's intent wasn't explicit, create an artifact if the response is long and structured.
  const hasHeadings = /^#{1,6} /m.test(aiResponse);
  const isLong = aiResponse.length > 300;

  if (hasHeadings && isLong) {
    console.log("Artifact CREATED: AI response is long and structured.");
    const title = generateSmartTitle(userMessage, aiResponse);
    return { shouldCreate: true, title: title };
  }

  // If none of the conditions are met, do not create an artifact.
  console.log("Artifact SKIPPED: No clear intent or qualifying response structure.");
  return { shouldCreate: false, title: "" };
}