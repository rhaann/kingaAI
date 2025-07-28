// src/app/api/chat/route.ts

import { sendMessage } from "@/services/sendMessage"; // <-- 1. Import our new service
import { generateSmartTitle } from "@/lib/smartTitles";
import { smartShouldCreateArtifact } from "@/lib/smartArtifacts";
import { ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "@/config/modelConfig"; // Import available models for a default

export async function POST(req: Request) {
  try {
    // Get all the data from the client's request
    const { message, modelConfig, conversationHistory, documentContext } = await req.json();

    // --- 2. VALIDATE AND PREPARE DATA ---
    if (!message) {
      return new Response("Message is required", { status: 400 });
    }

    // Provide a default model if the client doesn't send one
    const selectedModelConfig: ModelConfig = modelConfig || AVAILABLE_MODELS[3]; // Default to Gemini Flash

    // --- 3. CALL THE NEW sendMessage SERVICE ---
    // We now pass a single options object. The sessionId is no longer needed by this service.
    const result = await sendMessage(message, {
      modelConfig: selectedModelConfig,
      conversationHistory,
      documentContext,
    });
    
    const aiResponse = result.output;

    // --- 4. HANDLE ARTIFACT CREATION (No change here) ---
    if (!aiResponse) {
      return Response.json({ result: { output: "I'm sorry, I couldn't generate a response." } });
    }
    
    const artifactDecision = smartShouldCreateArtifact(message, aiResponse);
    
    if (artifactDecision.shouldCreate) {
      return Response.json({
        result: {
          output: `I've created the document for you: "${artifactDecision.title}"`,
          artifact: {
            id: `artifact-${Date.now()}`,
            title: artifactDecision.title, // Use the smarter title
            content: aiResponse,
            type: 'document'
          }
        }
      });
    }
    
    return Response.json({ result });

  } catch (err: any) {
    console.error("Error in /api/chat:", err);
    return new Response(err.message || "An unknown error occurred", { status: 500 });
  }
}