import { messageService } from "@/services/messageService";
import { AVAILABLE_MODELS } from "@/config/modelConfig";

export async function POST(req: Request) {
  try {
    const { conversationSample } = await req.json();
    
    const prompt = `Generate a short, descriptive title (3-6 words) for this conversation. Focus on the main topic or task. Don't use quotes.

Conversation:
${conversationSample}

Title:`;

    // Use a fast model for title generation
    const fastModel = AVAILABLE_MODELS.find(m => m.id === 'gemini-flash') || AVAILABLE_MODELS[0];
    
    const result = await messageService.sendMessage(prompt, fastModel);
    
    // Clean up the title
    let title = result.output.trim();
    title = title.replace(/['"]/g, ''); // Remove quotes
    title = title.slice(0, 50); // Limit length
    
    return Response.json({ title });
  } catch (error) {
    console.error('Title generation error:', error);
    return Response.json({ error: 'Failed to generate title' }, { status: 500 });
  }
}