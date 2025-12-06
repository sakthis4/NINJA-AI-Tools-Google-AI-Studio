import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { ExtractedAsset, AssetType, ComplianceFinding, ManuscriptIssue } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Schema for assets found on a single page
const PAGE_METADATA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      assetId: { type: Type.STRING, description: 'A unique identifier for the asset, e.g., "Figure 1.1", "Table 2".' },
      assetType: {
        type: Type.STRING,
        enum: ['Figure', 'Table', 'Image', 'Equation', 'Map', 'Graph'],
        description: 'The type of the asset.',
      },
      preview: {
        type: Type.STRING,
        description: 'A brief, one-sentence textual description or the content of the asset.',
      },
      altText: {
        type: Type.STRING,
        description: 'A detailed, context-aware alternative text for accessibility purposes.',
      },
      keywords: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'A list of 3-5 relevant keywords for the asset.',
      },
      taxonomy: {
        type: Type.STRING,
        description: 'A hierarchical classification for the asset, following the IPTC Media Topics standard. For example: "sport > association football (soccer)".',
      },
      boundingBox: {
        type: Type.OBJECT,
        description: 'The bounding box of the asset on its page. All values are percentages (0-100).',
        properties: {
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            width: { type: Type.NUMBER },
            height: { type: Type.NUMBER },
        },
        required: ['x', 'y', 'width', 'height'],
      },
    },
    required: ['assetId', 'assetType', 'preview', 'altText', 'keywords', 'taxonomy', 'boundingBox'],
  },
};


const SINGLE_ASSET_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    assetId: { type: Type.STRING, description: 'A suggested unique identifier for the asset, e.g., "Figure X", "Table Y".' },
    assetType: {
      type: Type.STRING,
      enum: ['Figure', 'Table', 'Image', 'Equation', 'Map', 'Graph'],
      description: 'The type of the asset.',
    },
    preview: {
      type: Type.STRING,
      description: 'A brief, one-sentence textual description or the content of the asset (e.g., the equation itself). This will be used as a preview.',
    },
    altText: {
      type: Type.STRING,
      description: 'A detailed, context-aware alternative text for accessibility purposes, fully describing the asset.',
    },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'A list of 3-5 relevant keywords for the asset.',
    },
    taxonomy: {
      type: Type.STRING,
      description: 'A hierarchical classification for the asset, following the IPTC Media Topics standard. For example: "sport > association football (soccer)".',
    },
  },
  required: ['assetId', 'assetType', 'preview', 'altText', 'keywords', 'taxonomy'],
};


const COMPLIANCE_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            checkCategory: { type: Type.STRING, description: 'The category of the compliance check, e.g., "Title Format", "Author Affiliations", "Funding Statement", "Conflict of Interest Disclosure".' },
            status: { type: Type.STRING, enum: ['pass', 'fail', 'warn'], description: 'The compliance status for this specific check. Use "pass" if compliant, "fail" for clear violations, and "warn" for ambiguities or potential issues.' },
            summary: { type: Type.STRING, description: 'A concise one-sentence summary of the finding.' },
            manuscriptQuote: { type: Type.STRING, description: 'The exact, brief quote from the manuscript that is relevant to the finding. If no specific quote applies (e.g., something is missing), state that clearly.' },
            manuscriptPage: { type: Type.NUMBER, description: 'The page number in the manuscript where the quote is found or where the issue occurs.' },
            ruleContent: { type: Type.STRING, description: 'The exact rule or guideline quoted from the rules document that is being checked against.' },
            rulePage: { type: Type.NUMBER, description: 'The page number in the rules document where the rule is found.' },
            recommendation: { type: Type.STRING, description: 'A detailed, actionable recommendation on how to address the issue to become compliant.' }
        },
        required: ['checkCategory', 'status', 'summary', 'manuscriptQuote', 'manuscriptPage', 'ruleContent', 'rulePage', 'recommendation']
    }
};

const MANUSCRIPT_ANALYSIS_SCHEMA = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            issueCategory: { type: Type.STRING, enum: ['Grammar', 'Plagiarism Concern', 'Structural Integrity', 'Clarity', 'Ethical Concern', 'Spelling'], description: 'The category of the issue found.' },
            priority: { type: Type.STRING, enum: ['High', 'Medium', 'Low'], description: 'The priority of the issue. High priority issues are critical and must be addressed.' },
            summary: { type: Type.STRING, description: 'A concise one-sentence summary of the issue.' },
            quote: { type: Type.STRING, description: 'The exact, brief quote from the manuscript where the issue occurs.' },
            pageNumber: { type: Type.NUMBER, description: 'The page number in the manuscript where the quote is found.' },
            recommendation: { type: Type.STRING, description: 'A detailed, actionable recommendation on how to fix the issue.' }
        },
        required: ['issueCategory', 'priority', 'summary', 'quote', 'pageNumber', 'recommendation']
    }
};

const BOOK_METADATA_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        onix: {
            type: Type.STRING,
            description: 'A complete and well-formed ONIX 3.0 XML document containing all extracted metadata. This should include all mandatory fields for distribution platforms.'
        },
        marc: {
            type: Type.STRING,
            description: 'A human-readable text representation of MARC21 metadata. Each field should be on a new line, formatted like `100 1# $a Author Name.`'
        }
    },
    required: ['onix', 'marc']
};

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 2000;

async function apiCallWithRetry<T>(apiCall: () => Promise<T>): Promise<T> {
    let attempts = 0;
    let delay = INITIAL_DELAY_MS;

    while (attempts < MAX_RETRIES) {
        try {
            return await apiCall();
        } catch (error: any) {
            attempts++;
            // Check for both rate limit (429) and server overload (503 / UNAVAILABLE) errors.
            const errorString = (error.message || error.toString()).toUpperCase();
            const isRetriableError = errorString.includes('429') || 
                                     errorString.includes('RESOURCE_EXHAUSTED') ||
                                     errorString.includes('503') ||
                                     errorString.includes('UNAVAILABLE');
            
            if (attempts < MAX_RETRIES && isRetriableError) {
                console.warn(`Retriable error detected. Retrying in ${delay / 1000}s... (Attempt ${attempts}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                console.error("API call failed after multiple retries or with a non-retriable error:", error);
                throw error;
            }
        }
    }
    throw new Error("API call failed after maximum retries.");
}

export async function extractAssetsFromPage(pageImageBase64: string, modelName: string): Promise<Omit<ExtractedAsset, 'id' | 'pageNumber'>[]> {
    const imagePart = { inlineData: { data: pageImageBase64, mimeType: 'image/jpeg' } };
    const textPart = { text: "Analyze the provided image, which is a single page from a document. Find ALL assets (figures, tables, images, equations, maps, and graphs) on this page. For each asset, extract its metadata according to the schema. For the taxonomy field, use the IPTC Media Topics standard to create a hierarchical classification. If no assets are found, return an empty array." };

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelName,
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: PAGE_METADATA_SCHEMA,
            },
        }));
        
        // FIX: Added a check for an empty or undefined response.text to prevent crashes.
        const jsonText = response.text?.trim();
        if (!jsonText) {
            console.warn("API returned empty response for page assets, returning empty array.");
            return [];
        }
        const parsedJson = JSON.parse(jsonText);
        if (!Array.isArray(parsedJson)) {
            console.warn("API returned non-array for page assets, returning empty array.", parsedJson);
            return [];
        }
        return parsedJson;

    } catch (error) {
        console.error("Error calling AI service for page processing:", error);
        throw new Error("Failed to process page with the AI service.");
    }
}

export async function generateMetadataForCroppedImage(imageDataUrl: string, modelName: string): Promise<Omit<ExtractedAsset, 'id' | 'pageNumber' | 'boundingBox'>> {
  const imageData = imageDataUrl.split(',')[1];
  const imagePart = { inlineData: { data: imageData, mimeType: 'image/png' } };
  const textPart = { text: 'Analyze the provided image, which is a cropped asset from a document. Generate metadata for it according to the schema. For the taxonomy field, use the IPTC Media Topics standard to create a hierarchical classification.' };

  const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: modelName,
    contents: { parts: [imagePart, textPart] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: SINGLE_ASSET_SCHEMA,
    },
  }));

  // FIX: Added a check for an empty or undefined response.text to prevent crashes.
  const jsonText = response.text?.trim();
  if (!jsonText) {
    throw new Error("API returned empty response for single asset metadata.");
  }
  const parsedJson = JSON.parse(jsonText);
    if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
        throw new Error("API returned invalid format for single asset metadata.");
    }
  return parsedJson;
}

export async function generateMetadataForImage(imageBase64: string, mimeType: string, modelName: string): Promise<Omit<ExtractedAsset, 'id' | 'pageNumber' | 'boundingBox'>> {
    const imagePart = { inlineData: { data: imageBase64, mimeType: mimeType } };
    const textPart = { text: "Analyze the provided image. Generate all metadata fields according to the schema. For the assetId, create a short descriptive ID based on the image content. For the taxonomy field, use the IPTC Media Topics standard to create a hierarchical classification." };

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelName,
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: SINGLE_ASSET_SCHEMA,
            },
        }));
        
        // FIX: Added a check for an empty or undefined response.text to prevent crashes.
        const jsonText = response.text?.trim();
        if (!jsonText) {
            throw new Error("API returned empty response for image metadata.");
        }
        const parsedJson = JSON.parse(jsonText);
        if (typeof parsedJson !== 'object' || parsedJson === null || Array.isArray(parsedJson)) {
            throw new Error("API returned invalid format for image metadata.");
        }
        return parsedJson;
    } catch (error) {
        console.error("Error calling AI service for image processing:", error);
        throw new Error("Failed to process image with the AI service.");
    }
}

export async function performComplianceCheck(manuscriptText: string, rulesText: string, modelName: string): Promise<ComplianceFinding[]> {
    const prompt = `
        You are a meticulous compliance editor. Your task is to compare the provided 'MANUSCRIPT CHUNK' against the provided 'RULES DOCUMENT'.
        Analyze the RULES DOCUMENT to understand all submission rules.
        Then, carefully check the MANUSCRIPT CHUNK against each rule.
        For every rule that you can verify (either pass or fail) based *only* on the content within this specific CHUNK, provide a compliance finding according to the provided JSON schema. If evidence for a rule is not present in this chunk, do not report on it.
        - If the chunk complies with a rule, mark it as 'pass'.
        - If it clearly violates a rule, mark it as 'fail'.
        - If compliance is ambiguous, mark it as 'warn'.
        - Provide exact quotes and page numbers from both documents for every finding.

        MANUSCRIPT CHUNK:
        ${manuscriptText}

        RULES DOCUMENT TEXT:
        ${rulesText}
    `;

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: COMPLIANCE_SCHEMA,
            },
        }));
        // FIX: Added a check for an empty or undefined response.text to prevent crashes.
        const jsonText = response.text?.trim();
        if (!jsonText) {
            console.warn("API returned empty response for compliance check, returning empty array.");
            return [];
        }
        const parsedJson = JSON.parse(jsonText);
        if (!Array.isArray(parsedJson)) {
            console.warn("API returned non-array for compliance check, returning empty array.", parsedJson);
            return [];
        }
        return parsedJson;
    } catch (error) {
        console.error("Error calling AI service for compliance check:", error);
        throw new Error("Failed to perform compliance check with the AI service.");
    }
}

export async function analyzeManuscript(manuscriptText: string, modelName: string): Promise<ManuscriptIssue[]> {
    const prompt = `
        You are an expert manuscript editor for a top-tier academic publisher. Your task is to perform a detailed analysis of the provided 'MANUSCRIPT CHUNK'.
        Your analysis must cover the following areas:
        1.  **Grammar and Spelling:** Identify and report all grammatical errors, typos, and awkward phrasing.
        2.  **Clarity and Flow:** Check for unclear sentences, logical inconsistencies, and poor structural flow.
        3.  **Structural Integrity:** Verify that the manuscript follows a logical structure (e.g., Introduction, Methods, Results, Discussion). Check for issues like missing sections or arguments that do not connect.
        4.  **Ethical Concerns:** Flag potential ethical issues, such as the lack of a patient consent statement in a medical study or indications of data manipulation.
        5.  **Plagiarism Concern:** Identify any sentences or paragraphs that are highly unoriginal, use overly complex but generic language, or are phrased in a way that strongly suggests they were copied from another source without proper attribution. You cannot perform a database search, but you can use your knowledge to flag text that is suspicious.

        For every issue you identify, provide a finding according to the provided JSON schema. Order your findings by priority, with 'High' priority items first.
        - **High Priority:** Critical errors that would prevent publication (e.g., plagiarism concerns, major ethical flags, incomprehensible grammar).
        - **Medium Priority:** Significant issues that harm readability or professionalism (e.g., structural problems, persistent grammatical errors).
        - **Low Priority:** Minor issues like typos or occasional awkward phrasing.

        MANUSCRIPT CHUNK:
        ${manuscriptText}
    `;

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: MANUSCRIPT_ANALYSIS_SCHEMA,
            },
        }));
        // FIX: Added a check for an empty or undefined response.text to prevent crashes.
        const jsonText = response.text?.trim();
        if (!jsonText) {
            console.warn("API returned empty response for manuscript analysis, returning empty array.");
            return [];
        }
        const parsedJson = JSON.parse(jsonText);
        if (!Array.isArray(parsedJson)) {
            console.warn("API returned non-array for manuscript analysis, returning empty array.", parsedJson);
            return [];
        }
        return parsedJson;
    } catch (error) {
        console.error("Error calling AI service for manuscript analysis:", error);
        throw new Error("Failed to perform manuscript analysis with the AI service.");
    }
}

export async function extractBookMetadata(fullText: string, modelName: string): Promise<{ onix: string; marc: string }> {
    const prompt = `
        You are an expert metadata librarian and publishing professional. Your task is to analyze the full text of the provided book or journal and extract comprehensive bibliographic metadata required for commercial distribution and library cataloging. Generate two distinct, standards-compliant metadata records.

        1.  **ONIX 3.0:** Create a complete, well-formed, and valid ONIX 3.0 XML document. This must include all mandatory fields required for major distribution platforms. Pay close attention to:
            - **RecordReference:** A unique identifier for this ONIX record.
            - **ProductIdentifier:** Include all available identifiers like ISBN-13 (ProprietaryID with IDTypeName "ISBN-13"), ISSN, and DOI.
            - **DescriptiveDetail:**
                - **TitleDetail:** Full title, subtitle. For journals, include Volume and Issue numbers (e.g., using <PartNumber> for issue).
                - **Contributor:** All authors, editors, etc., with correct roles and biographical notes if available.
                - **Language:** Language of the text.
                - **Extent:** Total number of pages (use ExtentType '00' and ExtentUnit '03').
                - **Subject:** Provide multiple subject headings using both BISAC (for North America) and Thema (international) schemes. Extract keywords and topics from the text to generate these.
            - **CollateralDetail:**
                - **TextContent:** Include a detailed summary/description (TextType code 03) and a full table of contents (TextType code 04) if present in the source text. Also include promotional text or keywords.
            - **PublishingDetail:**
                - **Publisher:** Full publisher name.
                - **PublishingDate:** Date of publication.
            - **ProductSupply:**
                - **SupplyDetail:** Include supplier information and at least one price (e.g., US Dollar).

        2.  **MARC21:** Create a human-readable text representation of a MARC21 record, ready for library systems. Each field must be on a new line, formatted precisely with the MARC tag, indicators, and subfield codes (e.g., \`100 1# $a Smith, John.\`). Include all essential fields:
            - **Leader:** A placeholder is acceptable if you cannot generate a valid one.
            - **008:** Fixed-Length Data Elements (Date of publication, language, etc.).
            - **020:** ISBN ($a).
            - **022:** ISSN ($a).
            - **082:** Dewey Decimal Classification (if it can be inferred).
            - **100:** Main Entry - Personal Name ($a Author Name, $d dates if available).
            - **245:** Title Statement ($a Title : $b subtitle / $c statement of responsibility).
            - **264:** Production, Publication, Distribution (use indicator 2 for publisher, include $a Place, $b Publisher Name, $c Date).
            - **300:** Physical Description ($a number of pages : $b other physical details ; $c dimensions).
            - **505:** Formatted Contents Note (Table of Contents).
            - **520:** Summary Note (A full, detailed summary or abstract).
            - **650:** Subject Added Entry - Topical Term ($a Topic -- $z Geographic subdivision). Generate multiple relevant subjects based on the content, including keywords and taxonomy.
            - **655:** Index Term - Genre/Form ($a Genre).
            - **773:** Host Item Entry (For journal articles, to contain journal title, Volume, Issue, and date information. e.g., $t Journal Title $g Vol. 12, Iss. 3 (2024)).

        Extract this information meticulously from the following document text.

        DOCUMENT TEXT:
        ${fullText}
    `;

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: BOOK_METADATA_SCHEMA,
            },
        }));
        // FIX: Added a check for an empty or undefined response.text to prevent crashes.
        const jsonText = response.text?.trim();
        if (!jsonText) {
            throw new Error("API returned empty response for book metadata extraction.");
        }
        const parsedJson = JSON.parse(jsonText);
        if (typeof parsedJson.onix !== 'string' || typeof parsedJson.marc !== 'string') {
            throw new Error("API response did not contain the expected 'onix' and 'marc' string properties.");
        }
        return parsedJson;
    } catch (error) {
        console.error("Error calling AI service for book metadata extraction:", error);
        throw new Error("Failed to extract book metadata with the AI service.");
    }
}
