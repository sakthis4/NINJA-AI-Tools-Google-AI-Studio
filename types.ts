
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
  canUseProModel: boolean; // Admin guardrail for expensive models
}

export interface UsageLog {
  id: string;
  userId: number;
  toolName: string;
  modelName: string; // Track which model was used
  timestamp: string;
  promptTokens: number;
  responseTokens: number;
  // New fields for report download from dashboard
  outputId?: string; // e.g., manuscriptId, pdfFileId
  outputName?: string; // e.g., the original filename
  reportData?: any; // For transient data like image tool results
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

export interface StatusBarMessage {
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

export type ManuscriptIssuePriority = 'High' | 'Medium' | 'Low';

export interface ManuscriptIssue {
    issueCategory: 'Grammar' | 'Plagiarism Concern' | 'Structural Integrity' | 'Clarity' | 'Ethical Concern' | 'Spelling' | 'Citation Integrity' | 'Identifier Integrity';
    priority: ManuscriptIssuePriority;
    summary: string;
    quote: string;
    pageNumber: number;
    recommendation: string;
}

export interface JournalRecommendation {
    journalName: string;
    publisher: string;
    issn?: string;
    field: string;
    reasoning: string;
}

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
  complianceReport?: ComplianceFinding[];
  analysisReport?: ManuscriptIssue[];
  journalRecommendations?: JournalRecommendation[];
  logs?: string[];
  progress?: number;
}

export interface ComplianceProjectFolder {
  id: string;
  name: string;
  profileId: string | null;
  manuscripts: ManuscriptFile[];
}

export interface AnalysisProjectFolder {
  id: string;
  name: string;
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

// Types for the new Book Metadata Extractor
export type BookFileStatus = 'queued' | 'processing' | 'completed' | 'error';

export interface BookFile {
  id: string;
  name: string;
  file?: File;
  status: BookFileStatus;
  onixMetadata?: string;
  marcMetadata?: string;
  logs?: string[];
  progress?: number;
}

export interface BookProjectFolder {
  id: string;
  name: string;
  bookFiles: BookFile[];
}


// Central data store for each user
export interface UserDataStore {
  metadataFolders: MetadataProjectFolder[];
  bookFolders: BookProjectFolder[];
  complianceFolders: ComplianceProjectFolder[];
  analysisFolders: AnalysisProjectFolder[];
  complianceProfiles: ComplianceProfile[];
  ruleFiles: Record<string, RuleFile>;
}

// New types for unified, versioned state management
export interface AppState {
    users: User[];
    usageLogs: UsageLog[];
    currentUserId: number | null;
    appData: Record<number, UserDataStore>; // User-specific data, keyed by userId
}

export interface StoredAppState extends AppState {
    version: number;
}