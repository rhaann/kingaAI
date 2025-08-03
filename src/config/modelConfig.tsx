import { ModelConfig } from '@/types/types';

const ALL_MODELS: ModelConfig[] = [
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    model: 'gpt-4-turbo', // This should work for most API keys
    description: 'Most capable model, best for complex tasks',
    contextLength: 8192,
    pricing: { input: 10, output: 30 }
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI', 
    model: 'gpt-3.5-turbo', // This definitely works
    description: 'Fast and efficient for most tasks',
    contextLength: 16384,
    pricing: { input: 0.5, output: 1.5 }
  },
  {
    id: 'gemini-1.5-flash-latest',
    name: 'Gemini Flash',
    provider: 'Google',
    model: 'gemini-1.5-flash',
    description: 'Fast and cost-effective',
    contextLength: 32768,
    pricing: { input: 0.35, output: 1.05 }
  }
];


// Function to get available models based on API keys
export async function getAvailableModels(): Promise<ModelConfig[]> {
  try {
    const response = await fetch('/api/available-models');
    const data = await response.json();
    
    return ALL_MODELS.filter(model => {
      return data.availableProviders.includes(model.provider);
    });
  } catch (error) {
    console.error('Failed to fetch available models:', error);
    // Fallback to Gemini if we can't determine available models
    return ALL_MODELS.filter(model => model.provider === 'Google');
  }
}

// Export all models for components that need the full list
export const AVAILABLE_MODELS = ALL_MODELS;

// Default fallback model (assuming Gemini is most likely to be configured)
export const DEFAULT_MODEL = ALL_MODELS.find(m => m.id === 'gemini-flash') || ALL_MODELS[0];