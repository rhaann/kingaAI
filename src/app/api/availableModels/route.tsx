// src/app/api/available-models/route.ts
export async function GET() {
    const availableProviders: string[] = [];
  
    // Check if OpenAI API key is configured
    if (process.env.OPENAI_API_KEY) {
      availableProviders.push('openai');
    }
  
    // Check if Gemini API key is configured  
    if (process.env.GEMINI_API_KEY) {
      availableProviders.push('google');
    }
  
    // Check if Anthropic API key is configured
    if (process.env.ANTHROPIC_API_KEY) {
      availableProviders.push('anthropic');
    }
  
    return Response.json({
      availableProviders,
      message: `Found ${availableProviders.length} available providers: ${availableProviders.join(', ')}`
    });
  }