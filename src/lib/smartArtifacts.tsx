// Smart rule-based artifact detection system

interface ArtifactRule {
    id: string;
    test: (message: string, response: string) => boolean;
    score: number;
    weight: number;
    description: string;
  }
  
  const ARTIFACT_RULES: ArtifactRule[] = [
    // Strong positive indicators
    {
      id: 'explicit_creation',
      test: (msg) => {
        // Match various creation patterns
        const creationWords = /\b(create|write|generate|make|draft|compose)\b/i;
        const documentTypes = /\b(document|email|report|letter|proposal|memo|brief|marketing email)\b/i;
        
        return creationWords.test(msg) && documentTypes.test(msg);
      },
      score: 10,
      weight: 0.9,
      description: 'User explicitly asks to create a document'
    },
    
    // Strong negative indicators  
    {
      id: 'question_about_existing',
      test: (msg) => /\b(what|how|why)\s+.*(that|the|this)\s+(document|email|report)/i.test(msg),
      score: -8,
      weight: 0.8,
      description: 'User asking about existing document'
    },
    
    {
      id: 'general_question',
      test: (msg) => /^(what|how|why|when|where|who|explain|tell me)/i.test(msg),
      score: -6,
      weight: 0.7,
      description: 'User asking a general question'
    }
  ];
  
  export function smartShouldCreateArtifact(userMessage: string, aiResponse: string): {
    shouldCreate: boolean;
    confidence: number;
    reasoning: string[];
  } {
    let totalScore = 0;
    const reasoning: string[] = [];
    
    // Apply each rule
    ARTIFACT_RULES.forEach(rule => {
      if (rule.test(userMessage, aiResponse)) {
        const weightedScore = rule.score * rule.weight;
        totalScore += weightedScore;
        reasoning.push(`${rule.id}: ${rule.score} (${rule.description})`);
      }
    });
    
    // Content analysis
    if (aiResponse.length > 500) {
      totalScore += 3;
      reasoning.push('content_length: +3 (substantial content)');
    }
    
    const shouldCreate = totalScore > 4.0; // threshold
    const confidence = Math.min(Math.abs(totalScore) / 10, 1.0);
    
    return {
      shouldCreate,
      confidence,
      reasoning
    };
  }