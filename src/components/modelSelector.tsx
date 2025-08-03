// components/ModelSelector.tsx
"use client";

import { useState } from 'react';
import { ChevronDown, Zap, Brain, Sparkles } from 'lucide-react';
import { ModelConfig } from '@/types/types';
import { AVAILABLE_MODELS, DEFAULT_MODEL } from '../config/modelConfig';

interface ModelSelectorProps {
  selectedModel: ModelConfig;
  onModelChange: (model: ModelConfig) => void;
  disabled?: boolean;
}

const getProviderIcon = (provider: string) => {
  switch (provider) {
    case 'OpenAI':
      return <Brain className="w-4 h-4" />;
    case 'Google':
      return <Sparkles className="w-4 h-4" />;
    case 'Anthropic':
      return <Zap className="w-4 h-4" />;
    default:
      return <Brain className="w-4 h-4" />;
  }
};

const getProviderColor = (provider: string) => {
  switch (provider) {
    case 'OpenAI':
      return 'text-green-400 bg-green-400/10 border-green-400/20';
    case 'Google':
      return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'Anthropic':
      return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
    default:
      return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  }
};

export default function ModelSelector({ selectedModel, onModelChange, disabled }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Use the passed model or fall back to default
  const currentModel = selectedModel || DEFAULT_MODEL;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-3 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-[400px]"
      >
        <div className={`w-2 h-2 rounded-full ${getProviderColor(currentModel.provider).split(' ')[2]}`} />
        <div className="flex-1 text-left">
          <div className="font-medium">{currentModel.name}</div>
          <div className="text-xs text-gray-400">{currentModel.description}</div>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 w-[400px] bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 max-h-96 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs text-gray-400 px-2 py-1 font-medium">
                Available Models
              </div>
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelChange(model);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg text-left hover:bg-gray-700 transition-colors ${
                    selectedModel && selectedModel.id === model.id ? 'bg-gray-700 ring-1 ring-blue-500' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 mt-0.5 ${getProviderColor(model.provider)}`}>
                    {getProviderIcon(model.provider)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{model.name}</span>
                      {model.pricing && (
                        <span className="text-xs text-gray-400">
                          ${model.pricing.input}/$1M
                        </span>
                      )}
                    </div>
                    
                    <div className="text-xs text-gray-400 mt-1">
                      {model.description}
                    </div>
                    
                    {model.contextLength && (
                      <div className="text-xs text-gray-500 mt-1">
                        Context: {model.contextLength.toLocaleString()} tokens
                      </div>
                    )}
                  </div>
                  
                  {selectedModel && selectedModel.id === model.id && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}