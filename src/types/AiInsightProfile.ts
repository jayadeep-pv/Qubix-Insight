export interface AiInsightProfile {

  id?: string;

  profileName: string;

  profileCode?: string;

  profileStatus?: number;

  profileStatusLabel?: string;   // <-- ADD THIS

  prompt?: string;

  displayOrder?: number;

  statecode?: number;

  createdOn?: string;

  modifiedOn?: string;

}