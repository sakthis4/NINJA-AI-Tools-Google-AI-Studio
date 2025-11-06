
export enum ComplianceStatus {
  COMPLIANT = 'COMPLIANT',
  NOT_COMPLIANT = 'NOT_COMPLIANT',
  PARTIALLY_COMPLIANT = 'PARTIALLY_COMPLIANT',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export interface ComplianceItem {
  checklistItem: string;
  status: ComplianceStatus;
  evidence: string;
  reasoning: string;
}

export type ComplianceReport = ComplianceItem[];
