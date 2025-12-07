
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import {
    ExtractedAsset,
    ComplianceFinding,
    JournalRecommendation,
    ManuscriptIssue,
    ManuscriptScores,
    MetadataAnalysisReport,
    PeerReviewSimulation,
    EditorialReport,
    IntegrityIssue,
    BookStructuralIssue,
    ReadabilityIssue,
    BookMetadataIssue,
    VisualAssetIssue,
    BookEditorialIssue,
    AssetType
} from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

async function apiCallWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        if (retries > 0 && (error.status === 429 || error.status === 503)) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return apiCallWithRetry(fn, retries - 1, delay * 2);
        }
        throw error;
    }
}

// --- Schemas ---

const ASSET_EXTRACTION_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            assetType: { type: Type.STRING, enum: Object.values(AssetType) },
            preview: { type: Type.STRING },
            altText: { type: Type.STRING },
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            taxonomy: { type: Type.STRING },
            boundingBox: {
                type: Type.OBJECT,
                properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    height: { type: Type.NUMBER }
                }
            }
        },
        required: ['assetType', 'altText', 'keywords', 'taxonomy']
    }
};

const SINGLE_ASSET_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        assetType: { type: Type.STRING, enum: Object.values(AssetType) },
        preview: { type: Type.STRING },
        altText: { type: Type.STRING },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        taxonomy: { type: Type.STRING },
    },
    required: ['assetType', 'altText', 'keywords', 'taxonomy']
};

const COMPLIANCE_CHECK_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        findings: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    checkCategory: { type: Type.STRING },
                    status: { type: Type.STRING, enum: ['pass', 'fail', 'warn'] },
                    summary: { type: Type.STRING },
                    manuscriptQuote: { type: Type.STRING },
                    manuscriptPage: { type: Type.NUMBER },
                    ruleContent: { type: Type.STRING },
                    rulePage: { type: Type.NUMBER },
                    recommendation: { type: Type.STRING },
                },
                required: ['checkCategory', 'status', 'summary', 'recommendation']
            }
        },
        recommendations: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    journalName: { type: Type.STRING },
                    publisher: { type: Type.STRING },
                    issn: { type: Type.STRING },
                    field: { type: Type.STRING },
                    reasoning: { type: Type.STRING },
                }
            }
        }
    }
};

const MANUSCRIPT_ANALYSIS_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            issueCategory: { type: Type.STRING },
            priority: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
            summary: { type: Type.STRING },
            quote: { type: Type.STRING },
            pageNumber: { type: Type.NUMBER },
            recommendation: { type: Type.STRING },
        },
        required: ['issueCategory', 'priority', 'summary', 'recommendation']
    }
};

const MANUSCRIPT_SCORING_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        complianceScore: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, reasoning: { type: Type.STRING } } },
        scientificQualityScore: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, reasoning: { type: Type.STRING } } },
        writingQualityScore: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, reasoning: { type: Type.STRING } } },
        citationMaturityScore: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, reasoning: { type: Type.STRING } } },
        noveltyScore: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, reasoning: { type: Type.STRING } } },
        dataIntegrityRiskScore: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, reasoning: { type: Type.STRING } } },
        editorAcceptanceLikelihood: { type: Type.OBJECT, properties: { score: { type: Type.NUMBER }, reasoning: { type: Type.STRING } } },
    }
};

const METADATA_ANALYSIS_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        predictedSectionType: { type: Type.STRING },
        generatedKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        orcidValidation: {
             type: Type.ARRAY, 
             items: { type: Type.OBJECT, properties: { authorName: {type: Type.STRING}, orcid: {type: Type.STRING}, isValid: {type: Type.BOOLEAN} } }
        },
        fundingMetadata: {
             type: Type.ARRAY,
             items: { type: Type.OBJECT, properties: { funderName: {type: Type.STRING}, grantNumber: {type: Type.STRING} } }
        },
        suggestedTaxonomy: {
             type: Type.ARRAY,
             items: { type: Type.OBJECT, properties: { scheme: {type: Type.STRING}, tags: {type: Type.ARRAY, items: {type: Type.STRING}} } }
        },
        correspondingAuthor: {
            type: Type.OBJECT,
            properties: {
                name: { type: Type.STRING },
                email: { type: Type.STRING },
                affiliation: { type: Type.STRING },
                isComplete: { type: Type.BOOLEAN }
            }
        }
    }
};

const PEER_REVIEW_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        manuscriptSummary: { type: Type.STRING },
        strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
        weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
        reviewerConcerns: { type: Type.ARRAY, items: { type: Type.STRING } },
        methodologicalGaps: { type: Type.STRING },
        reviewerQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        suitabilityForPeerReview: { type: Type.STRING },
    }
};

const EDITORIAL_ENHANCEMENT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        titleSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        abstractRewrite: { type: Type.OBJECT, properties: { original: { type: Type.STRING }, rewritten: { type: Type.STRING }, note: { type: Type.STRING } } },
        keywordSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        ethicsStatement: { type: Type.STRING },
        citationImprovements: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { original: { type: Type.STRING }, suggestion: { type: Type.STRING } } } },
        contentImprovements: { 
            type: Type.ARRAY, 
            items: { 
                type: Type.OBJECT, 
                properties: { 
                    type: { type: Type.STRING }, 
                    originalText: { type: Type.STRING }, 
                    suggestedText: { type: Type.STRING }, 
                    location: { type: Type.STRING }, 
                    reason: { type: Type.STRING } 
                } 
            } 
        }
    }
};

const INTEGRITY_CHECK_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING },
            status: { type: Type.STRING, enum: ['Pass', 'Fail', 'Warning', 'N/A'] },
            finding: { type: Type.STRING },
            snippet: { type: Type.STRING },
            recommendation: { type: Type.STRING }
        }
    }
};

const BOOK_STRUCTURAL_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            issueCategory: { type: Type.STRING },
            priority: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
            summary: { type: Type.STRING },
            details: { type: Type.STRING },
            location: { type: Type.STRING },
            recommendation: { type: Type.STRING }
        }
    }
};

const READABILITY_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            issueCategory: { type: Type.STRING },
            priority: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
            summary: { type: Type.STRING },
            details: { type: Type.STRING },
            location: { type: Type.STRING },
            quote: { type: Type.STRING },
            recommendation: { type: Type.STRING }
        }
    }
};

const BOOK_METADATA_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING },
            status: { type: Type.STRING, enum: ['Pass', 'Fail', 'Warning'] },
            summary: { type: Type.STRING },
            details: { type: Type.STRING },
            recommendation: { type: Type.STRING }
        }
    }
};

const BOOK_VISUALS_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING },
            status: { type: Type.STRING, enum: ['Pass', 'Fail', 'Warning', 'Info'] },
            description: { type: Type.STRING },
            location: { type: Type.STRING },
            recommendation: { type: Type.STRING }
        }
    }
};

const BOOK_EDITORIAL_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            category: { type: Type.STRING },
            severity: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
            quote: { type: Type.STRING },
            location: { type: Type.STRING },
            suggestion: { type: Type.STRING }
        }
    }
};

const BOOK_METADATA_EXTRACTION_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        onix: { type: Type.STRING, description: "Full ONIX 3.0 XML record" },
        marc: { type: Type.STRING, description: "Full MARC21 text record" }
    }
};


// --- API Functions ---

export async function extractAssetsFromPage(pageImageBase64: string, modelName: string): Promise<ExtractedAsset[]> {
    const prompt = `Analyze this PDF page image. Identify all Figures, Tables, Images, Equations, Maps, and Graphs. 
    For each, extract:
    - Type (AssetType)
    - A brief visual description (preview)
    - Accessibility Alt Text
    - Keywords (SEO)
    - Taxonomy classification
    - Bounding Box (0-100% relative coordinates)`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/jpeg', data: pageImageBase64 } },
                { text: prompt }
            ]
        },
        config: {
            responseMimeType: 'application/json',
            responseSchema: ASSET_EXTRACTION_SCHEMA,
        },
    }));

    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) return [];
    return JSON.parse(jsonText);
}

export async function generateMetadataForCroppedImage(imageDataUrl: string, modelName: string): Promise<ExtractedAsset> {
     // ImageDataUrl is "data:image/png;base64,..."
    const base64 = imageDataUrl.split(',')[1];
    const prompt = `Analyze this cropped image asset. Generate accessibility and SEO metadata:
    - Determine Asset Type (Figure, Table, Image, etc.)
    - Detailed Alt Text
    - Keywords
    - Taxonomy`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/png', data: base64 } },
                { text: prompt }
            ]
        },
        config: {
            responseMimeType: 'application/json',
            responseSchema: SINGLE_ASSET_SCHEMA,
        },
    }));
    
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) throw new Error("No response from AI");
    // Add dummy ID and other fields that will be overwritten by the caller
    const result = JSON.parse(jsonText);
    return { ...result, id: '', assetId: `Asset-${Math.floor(Math.random()*1000)}` };
}

export async function generateMetadataForImage(base64Data: string, mimeType: string, modelName: string): Promise<ExtractedAsset> {
    const prompt = `Analyze this image. Generate metadata: Asset Type, Alt Text, Keywords, Taxonomy.`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: {
            parts: [
                { inlineData: { mimeType: mimeType, data: base64Data } },
                { text: prompt }
            ]
        },
        config: {
            responseMimeType: 'application/json',
            responseSchema: SINGLE_ASSET_SCHEMA,
        },
    }));

    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) throw new Error("No response from AI");
    const result = JSON.parse(jsonText);
     return { ...result, id: '', assetId: `Image-${Math.floor(Math.random()*1000)}` };
}

export async function performComplianceCheck(textChunk: string, rulesText: string, modelName: string, isFirstChunk: boolean): Promise<{ findings: ComplianceFinding[], recommendations: JournalRecommendation[] }> {
    const prompt = `
    Check this manuscript text against the provided submission guidelines/rules.
    
    MANUSCRIPT TEXT:
    ${textChunk.substring(0, 25000)}

    RULES:
    ${rulesText}

    Task:
    1. Identify compliance issues (pass, fail, warn).
    2. Provide specific evidence from the manuscript and the rule.
    ${isFirstChunk ? '3. Based on the abstract/intro, recommend 3 suitable journals.' : ''}
    `;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: COMPLIANCE_CHECK_SCHEMA,
        },
    }));

    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) return { findings: [], recommendations: [] };
    const result = JSON.parse(jsonText);
    return { findings: result.findings || [], recommendations: result.recommendations || [] };
}

export async function analyzeManuscript(text: string, modelName: string): Promise<ManuscriptIssue[]> {
    const prompt = `Analyze this manuscript for: Grammar, Plagiarism Concerns, Structure, Clarity, Ethics, Spelling, Citations.
    Return a list of issues.
    TEXT: ${text.substring(0, 30000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: MANUSCRIPT_ANALYSIS_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    return jsonText ? JSON.parse(jsonText) : [];
}

export async function scoreManuscript(text: string, modelName: string): Promise<ManuscriptScores> {
    const prompt = `Score this manuscript (0-100) on: Compliance, Scientific Quality, Writing Quality, Citation Maturity, Novelty, Data Integrity Risk, Editor Acceptance Likelihood. Provide reasoning.
    TEXT: ${text.substring(0, 30000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: MANUSCRIPT_SCORING_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) throw new Error("No scores generated");
    return JSON.parse(jsonText);
}

export async function analyzeJournalMetadata(text: string, modelName: string): Promise<MetadataAnalysisReport> {
    const prompt = `Analyze manuscript metadata. Predict section type, generate keywords, validate ORCIDs (mock validation), extract funding info, suggest taxonomy, and check corresponding author details.
    TEXT: ${text.substring(0, 15000)}`;

     const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: METADATA_ANALYSIS_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) throw new Error("No metadata analysis generated");
    return JSON.parse(jsonText);
}

export async function simulatePeerReview(text: string, modelName: string): Promise<PeerReviewSimulation> {
    const prompt = `Simulate a peer review. Summarize, list strengths/weaknesses, concerns, gaps, questions, and suitability.
    TEXT: ${text.substring(0, 30000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: PEER_REVIEW_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) throw new Error("No peer review generated");
    return JSON.parse(jsonText);
}

export async function generateEditorialEnhancements(text: string, modelName: string): Promise<EditorialReport> {
    const prompt = `Act as an Editorial Assistant. Suggest titles, rewrite abstract, keywords, ethics statement, citation fixes, and content improvements (grammar/clarity).
    TEXT: ${text.substring(0, 30000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: EDITORIAL_ENHANCEMENT_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) throw new Error("No editorial report generated");
    return JSON.parse(jsonText);
}

export async function performIntegrityCheck(text: string, modelName: string): Promise<IntegrityIssue[]> {
    const prompt = `Perform a Research Integrity Check. Check for Ethics Approval, Consent, Clinical Trial Registration, Conflict of Interest, Author Contribution, Data Integrity.
    TEXT: ${text.substring(0, 30000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: INTEGRITY_CHECK_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    return jsonText ? JSON.parse(jsonText) : [];
}

export async function analyzeBookStructure(text: string, modelName: string): Promise<BookStructuralIssue[]> {
    const prompt = `Analyze Book Structure: Chapter Sequence, Completeness, Formatting, Content Anomalies.
    TEXT: ${text.substring(0, 30000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: BOOK_STRUCTURAL_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    return jsonText ? JSON.parse(jsonText) : [];
}

export async function analyzeReadability(text: string, modelName: string): Promise<ReadabilityIssue[]> {
    const prompt = `Analyze Book Readability: Score, Tone, Clarity, Passive Voice.
    TEXT: ${text.substring(0, 30000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: READABILITY_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    return jsonText ? JSON.parse(jsonText) : [];
}

export async function validateBookMetadata(text: string, modelName: string): Promise<BookMetadataIssue[]> {
    const prompt = `Validate Book Metadata & TOC against content. Check TOC Mismatch, Chapter Numbering, Front Matter.
    TEXT: ${text.substring(0, 10000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: BOOK_METADATA_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    return jsonText ? JSON.parse(jsonText) : [];
}

export async function analyzeBookVisuals(text: string, modelName: string): Promise<VisualAssetIssue[]> {
    const prompt = `Analyze textual references to Book Visuals. Check Numbering, Captions, Broken Refs, Placeholders.
    TEXT: ${text.substring(0, 30000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: BOOK_VISUALS_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    return jsonText ? JSON.parse(jsonText) : [];
}

export async function analyzeBookEditorial(manuscriptText: string, modelName: string): Promise<BookEditorialIssue[]> {
    const prompt = `
        You are an expert copyeditor for high-quality book manuscripts. Perform a precise editorial check on the text provided.

        **Tasks:**
        1. **Grammar:** Identify objective grammatical errors such as subject-verb disagreement, incorrect verb tense, dangling modifiers, and misuse of articles.
           - **CRITICAL EXCLUSION:** Do NOT report on hyphenation, en-dashes, em-dashes, or compound words. Assume all hyphenation choices are intentional stylistic decisions.
        
        2. **Unclear Meaning (Style):** Flag sentences that are convoluted, ambiguous, or poorly constructed to the point where meaning is lost. Identify awkward phrasing that disrupts the reading flow. Map these to the 'Unclear Meaning' category.
        
        3. **Repetition:** Detect unintentional repetition of words (e.g., "the the") or redundancy in immediate proximity.

        Report findings using the JSON schema provided.

        MANUSCRIPT TEXT:
        ${manuscriptText.substring(0, 30000)}
    `;

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: BOOK_EDITORIAL_SCHEMA,
            },
        }));
        // Clean potential markdown formatting from the response
        const jsonText = response.text?.replace(/```json|```/g, '').trim();
        if (!jsonText) return [];
        const result = JSON.parse(jsonText);
        return Array.isArray(result) ? result : [];
    } catch (error) {
        console.error("Error analyzing book editorial:", error);
        throw new Error("Failed to analyze book editorial.");
    }
}

export async function extractBookMetadata(text: string, modelName: string): Promise<{ onix: string, marc: string }> {
    const prompt = `Extract Book Metadata from text. Generate a full valid ONIX 3.0 XML record and a MARC21 text record.
    TEXT: ${text.substring(0, 15000)}`;

    const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: BOOK_METADATA_EXTRACTION_SCHEMA,
        },
    }));
    const jsonText = response.text?.replace(/```json|```/g, '').trim();
    if (!jsonText) throw new Error("No metadata generated");
    return JSON.parse(jsonText);
}
