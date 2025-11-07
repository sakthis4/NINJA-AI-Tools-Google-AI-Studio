
export enum Role {
  Admin = 'Admin',
  User = 'User',
}

export interface User {
  id: number;
  email: string;
  password?: string; // Add password for login
  role: Role;
  tokenCap: number;
  tokensUsed: number;
  lastLogin: string;
  status: 'active' | 'inactive';
}

export interface UsageLog {
  id: string;
  userId: number;
  toolName: string;
  timestamp: string;
  promptTokens: number;
  responseTokens: number;
}

export enum AssetType {
    Figure = 'Figure',
    Table = 'Table',
    Image = 'Image',
    Equation = 'Equation',
    Map = 'Map',
    Graph = 'Graph'
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ExtractedAsset {
    id:string;
    assetId: string;
    assetType: AssetType;
    pageNumber?: number;
    preview: string;
    altText: string;
    keywords: string[];
    taxonomy: string;
    boundingBox?: BoundingBox;
}

export interface ToastData {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export type FindingStatus = 'pass' | 'fail' | 'warn';

export interface ComplianceFinding {
    checkCategory: string;
    status: FindingStatus;
    summary: string;
    manuscriptQuote: string;
    manuscriptPage: number;
    ruleContent: string;
    rulePage: number;
    recommendation: string;
}
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

// Types for the new folder-based Compliance Checker
export type ManuscriptStatus = 'queued' | 'processing' | 'completed' | 'error';

export interface RuleFile {
  id: string;
  name: string;
  textContent: string;
}

export interface ComplianceProfile {
  id: string;
  name: string;
  ruleFileIds: string[];
}

export interface ManuscriptFile {
  id: string;
  name: string;
  file?: File; // File is transient and not stored in localStorage
  status: ManuscriptStatus;
  report?: ComplianceFinding[];
  logs?: string[];
  progress?: number;
}

export interface ProjectFolder {
  id: string;
  name: string;
  profileId: string | null;
  manuscripts: ManuscriptFile[];
}

// Types for the new folder-based Metadata Extractor
export type PdfFileStatus = 'queued' | 'processing' | 'completed' | 'error';

export interface PdfFile {
  id: string;
  name: string;
  file?: File; // File is transient and not stored in localStorage
  status: PdfFileStatus;
  assets?: ExtractedAsset[];
  logs?: string[];
  progress?: number;
}

export interface MetadataProjectFolder {
  id: string;
  name: string;
  pdfFiles: PdfFile[];
}