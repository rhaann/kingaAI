import { sendMessage } from "@/services/sendMessage";
import { ModelConfig, LLMResult } from "@/types/types";
import { AVAILABLE_MODELS } from "@/config/modelConfig";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message, modelConfig, conversationHistory, documentContext, currentArtifactId, currentArtifactTitle } = body;

    if (!message) {
      return new Response("Message is required", { status: 400 });
    }

    const selectedModelConfig: ModelConfig = modelConfig && modelConfig.provider 
      ? modelConfig 
      : AVAILABLE_MODELS[2];

    const result: LLMResult = await sendMessage(message, {
      modelConfig: selectedModelConfig,
      conversationHistory,
      documentContext,
    });
    
    switch (result.type) {
      case 'tool_call':
        if (result.toolName === 'create_document') {
          const { title, content } = result.toolArgs;
          return Response.json({
            result: {
              output: `I've created a document for you: "${title}"`,
              artifact: {
                id: `artifact-${Date.now()}`,
                title: title,
                type: 'document',
                // Create the first version
                versions: [{ content: content, createdAt: Date.now() }],
                createdAt: Date.now(),
                updatedAt: Date.now(),
              }
            }
          });
        }
        
        if (result.toolName === 'update_document') {
          if (!currentArtifactId || !currentArtifactTitle) {
            throw new Error("Attempted to update a document, but no current artifact ID or title was provided.");
          }
          const { content } = result.toolArgs;
          
          // --- THIS IS THE FIX ---
          // We now construct a partial artifact object that includes the new version.
          // Our useChats hook will know how to merge this.
          return Response.json({
            result: {
              output: `I've updated the document for you.`,
              artifact: {
                id: currentArtifactId,
                title: currentArtifactTitle,
                type: 'document',
                // The hook only needs the LATEST version to push onto the history.
                versions: [{ content: content, createdAt: Date.now() }],
                updatedAt: Date.now(),
              }
            }
          });
        }
        throw new Error(`Unknown tool name: ${result.toolName}`);

      case 'text':
      default:
        const aiResponse = result.content || "I'm sorry, I couldn't generate a response.";
        return Response.json({
          result: {
            output: aiResponse
          }
        });
    }

  } catch (err: any) {
    console.error("Error in /api/chat:", err.stack || err);
    return new Response(err.message || "An unknown error occurred", { status: 500 });
  }
}