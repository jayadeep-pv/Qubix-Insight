export interface DocumentType {
  id?: string
  name: string
  description?: string
  baseAiPrompt?: string
  isActive: boolean
  enableCompare?: boolean
  enableScoring?: boolean
  enableSummarise?: boolean
  createdOn?: string
  modifiedOn?: string
}