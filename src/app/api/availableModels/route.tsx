// src/app/api/available-models/route.ts
export async function GET() {
    const availableProviders: string[] = [];
  
    // Check if OpenAI API key is configured
    if (process.env.OPENAI_API_KEY) {
      availableProviders.push('OpenAI');
    }
  
    // Check if Gemini API key is configured  
    if (process.env.GEMINI_API_KEY) {
      availableProviders.push('Google');
    }
  
    // Check if Anthropic API key is configured
    if (process.env.ANTHROPIC_API_KEY) {
      availableProviders.push('Anthropic');
    }
  
    return Response.json({
      availableProviders,
      message: `Found ${availableProviders.length} available providers: ${availableProviders.join(', ')}`
    });
  }