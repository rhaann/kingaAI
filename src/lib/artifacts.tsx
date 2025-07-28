// Business document keywords that suggest an artifact should be created
const ARTIFACT_TRIGGERS = [
    'create a', 'generate a', 'write a', 'draft a', 'make a',
    'document', 'report', 'memo', 'proposal', 'contract', 'agreement',
    'presentation', 'plan', 'strategy', 'outline', 'template',
    'letter', 'email', 'invoice', 'budget', 'schedule',
    'policy', 'procedure', 'manual', 'guide', 'checklist'
  ];
  
  export function shouldCreateArtifact(userMessage: string, aiResponse: string): boolean {
    const message = userMessage.toLowerCase();
    const response = aiResponse.toLowerCase();
    
    // Check if user is asking to create business documents
    const hasDocumentRequest = ARTIFACT_TRIGGERS.some(trigger => 
      message.includes(trigger)
    );
    
    // Check if AI response is substantial content (more than 200 characters)
    const isSubstantialContent = aiResponse.length > 200;
    
    // Check if response contains structured content (multiple lines/paragraphs)
    const hasStructuredContent = aiResponse.split('\n').length > 3;
    
    return hasDocumentRequest && (isSubstantialContent || hasStructuredContent);
  }
  
  export function generateArtifactTitle(userMessage: string): string {
    const message = userMessage.toLowerCase();
    
    // More specific matching
    if (message.includes('business plan')) return 'Business Plan';
    if (message.includes('marketing plan')) return 'Marketing Plan';
    if (message.includes('strategic plan')) return 'Strategic Plan';
    
    if (message.includes('report')) return 'Report';
    if (message.includes('memo')) return 'Memorandum';
    if (message.includes('proposal')) return 'Proposal';
    if (message.includes('contract')) return 'Contract';
    if (message.includes('presentation')) return 'Presentation';
    if (message.includes('email')) return 'Email Draft';
    if (message.includes('letter')) return 'Letter';
    if (message.includes('policy')) return 'Policy Document';
    if (message.includes('procedure')) return 'Procedure';
    if (message.includes('guide')) return 'Guide';
    if (message.includes('manual')) return 'Manual';
    if (message.includes('how to')) return 'How-To Guide';
    if (message.includes('how ') && message.includes('work')) return 'Explanation Document';
    
    // Default based on action words
    if (message.includes('create') || message.includes('write') || message.includes('draft')) {
      return 'Document';
    }
    
    return 'Document';
  }