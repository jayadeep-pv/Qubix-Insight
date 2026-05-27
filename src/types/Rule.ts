export interface Rule {

  id?: string;

  name: string;

  advisoryText?: string;

  comparisonDirection?: number;

  impactCategory?: number;

  severity?: number;

  weight?: number;

  templateId?: string;
  templateName?: string;

  templateAttributeId?: string;
  templateAttributeName?: string;

  isActive?: boolean;

  createdOn?: string;
  modifiedOn?: string;

}


export interface RuleLookupTemplate {
  id: string;
  name: string;
}

export interface RuleLookupAttribute {
  id: string;
  name?: string;
  displayName?: string;
  templateId?: string;
}