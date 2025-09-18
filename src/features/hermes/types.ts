export type Contact = {
    id: string;
    name: string;
    title: string;
    email: string;
    selected: boolean;
  };
  
  export type ParsedCompany = {
    name: string;
    website?: string;
    contactName?: string;
    contactEmail?: string;
    contacts?: Array<{ name?: string; email?: string; title?: string }>;
  };
  
  // Keep Step as a numeric union to match current usage
  export type Step = -1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  