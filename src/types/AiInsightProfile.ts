export interface AiInsightProfile {

  id?: string;

  profileName: string;

  profileCode?: string;

  profileStatus?: number;

  profileStatusLabel?: string;

  prompt?: string;

  displayOrder?: number;

  isDefault?: boolean;

  isMandatory?: boolean;

  statecode?: number;

  createdOn?: string;

  modifiedOn?: string;

}