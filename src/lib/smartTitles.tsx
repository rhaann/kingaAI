export function generateSmartTitle(userMessage: string): string {
    const message = userMessage.toLowerCase();
    
    // Extract document type and subject/topic
    const result = extractDocumentInfo(message);
    
    if (result.topic && result.type) {
      return `${result.topic} ${result.type}`;
    } else if (result.type) {
      return result.type;
    }
    
    return 'Document';
  }
  
  interface DocumentInfo {
    type: string;
    topic: string | null;
  }
  
  function extractDocumentInfo(message: string): DocumentInfo {
    // Document type patterns with their formatted names
    const typePatterns = [
      { pattern: /\b(marketing\s+)?email\b/i, name: 'Email' },
      { pattern: /\bbusiness\s+plan\b/i, name: 'Business Plan' },
      { pattern: /\bmarketing\s+plan\b/i, name: 'Marketing Plan' },
      { pattern: /\bproposal\b/i, name: 'Proposal' },
      { pattern: /\breport\b/i, name: 'Report' },
      { pattern: /\bmemo\b/i, name: 'Memo' },
      { pattern: /\bletter\b/i, name: 'Letter' },
      { pattern: /\bcontract\b/i, name: 'Contract' },
      { pattern: /\bguide\b/i, name: 'Guide' },
      { pattern: /\bmanual\b/i, name: 'Manual' },
    ];
    
    // Find document type
    let documentType = 'Document';
    for (const { pattern, name } of typePatterns) {
      if (pattern.test(message)) {
        documentType = name;
        break;
      }
    }
    
    // Extract topic using common patterns
    const topic = extractTopic(message, documentType);
    
    return {
      type: documentType,
      topic: topic
    };
  }
  
  function extractTopic(message: string, documentType: string): string | null {
    // Pattern: "email for [topic]" - more flexible
    const forPattern = /(?:email|report|proposal|letter|guide|plan)\s+for\s+(?:a\s+)?(.+?)(?:\?|\.|\s*$)/i;
    const forMatch = message.match(forPattern);
    if (forMatch) {
      let topic = forMatch[1].trim();
      // Clean up common endings
      topic = topic.replace(/\s+(shop|business|company)$/, ' $1');
      return capitalizeWords(topic);
    }
    
    // Pattern: "about [topic]" 
    const aboutPattern = /(?:document|report|guide|manual)\s+about\s+(.+?)(?:\?|\.|\s*$)/i;
    const aboutMatch = message.match(aboutPattern);
    if (aboutMatch) {
      return capitalizeWords(aboutMatch[1].trim());
    }
    
    // Pattern: "create a business proposal for [topic]"
    const createPattern = /create\s+(?:a\s+)?(?:business\s+)?(?:proposal|report|plan|guide)\s+for\s+(.+?)(?:\?|\.|\s*$)/i;
    const createMatch = message.match(createPattern);
    if (createMatch) {
      return capitalizeWords(createMatch[1].trim());
    }
    
    // Pattern: "[adjective] [topic] email/report" (like "marketing coffee email")
    const adjTopicPattern = /(?:marketing|business|sales)\s+(.+?)\s+(?:email|report|proposal)/i;
    const adjMatch = message.match(adjTopicPattern);
    if (adjMatch) {
      return capitalizeWords(adjMatch[1].trim());
    }
    
    return null;
  }
  
  function capitalizeWords(str: string): string {
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }