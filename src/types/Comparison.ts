export interface Comparison {
  id: string;
  name: string;
  insightName?: string;

  runNumber?: string;
  mode?: string;
  documents?: number;
  documentType?: string;

  template?: string;
  createdBy?: string;
  createdDate?: string;
  
  documentCount?: number;
  
  score?: number;
  highSeverityCount?: number;

  status: "Processing" | "Completed" | "Failed";
}