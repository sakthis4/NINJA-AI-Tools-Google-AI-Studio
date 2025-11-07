import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { ExtractedAsset, AssetType, ComplianceFinding } from '../types';

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

const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 2000;

/**
 * A wrapper function that adds retry logic with exponential backoff for API calls.
 * @param apiCall The async function to call.
 * @returns The result of the API call.
 */
async function apiCallWithRetry<T>(apiCall: () => Promise<T>): Promise<T> {
    let attempts = 0;
    let delay = INITIAL_DELAY_MS;

    while (attempts < MAX_RETRIES) {
        try {
            return await apiCall();
        } catch (error: any) {
            attempts++;
            const isRateLimitError = error.toString().includes('429') || (error.message && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')));
            
            if (attempts < MAX_RETRIES && isRateLimitError) {
                console.warn(`Rate limit hit. Retrying in ${delay / 1000}s... (Attempt ${attempts}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                console.error("API call failed after multiple retries or with a non-retriable error:", error);
                throw error; // Re-throw the error if it's not a rate limit issue or retries are exhausted
            }
        }
    }
    throw new Error("API call failed after maximum retries.");
}


/**
 * Processes a single page image from a PDF to extract metadata for all assets on that page.
 * @param pageImageBase64 - Base64 encoded string of the page image (JPEG format).
 * @returns A promise that resolves to an array of extracted assets for that page.
 */
export async function extractAssetsFromPage(pageImageBase64: string): Promise<Omit<ExtractedAsset, 'id' | 'pageNumber'>[]> {
    const imagePart = { inlineData: { data: pageImageBase64, mimeType: 'image/jpeg' } };
    const textPart = { text: "Analyze the provided image, which is a single page from a document. Find ALL assets (figures, tables, images, equations, maps, and graphs) on this page. For each asset, extract its metadata according to the schema. For the taxonomy field, use the IPTC Media Topics standard to create a hierarchical classification. If no assets are found, return an empty array." };

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            // FIX: The 'contents' property should be a Content object, not an array containing a Content object for multipart requests.
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: PAGE_METADATA_SCHEMA,
            },
        }));
        
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error calling Gemini API for page processing:", error);
        throw new Error("Failed to process page with Gemini API.");
    }
}


export async function generateMetadataForCroppedImage(imageDataUrl: string): Promise<Omit<ExtractedAsset, 'id' | 'pageNumber' | 'boundingBox'>> {
  const imageData = imageDataUrl.split(',')[1];

  const imagePart = {
    inlineData: {
      data: imageData,
      mimeType: 'image/png'
    }
  };
  
  const textPart = {
    text: 'Analyze the provided image, which is a cropped asset from a document. Generate metadata for it according to the schema. For the taxonomy field, use the IPTC Media Topics standard to create a hierarchical classification.'
  };

  const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [imagePart, textPart] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: SINGLE_ASSET_SCHEMA,
    },
  }));

  const jsonText = response.text.trim();
  return JSON.parse(jsonText);
}

export async function generateMetadataForImage(imageBase64: string, mimeType: string): Promise<Omit<ExtractedAsset, 'id' | 'pageNumber' | 'boundingBox'>> {
    const imagePart = { inlineData: { data: imageBase64, mimeType: mimeType } };
    const textPart = { text: "Analyze the provided image. Generate all metadata fields according to the schema. For the assetId, create a short descriptive ID based on the image content. For the taxonomy field, use the IPTC Media Topics standard to create a hierarchical classification." };

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            // FIX: The 'contents' property should be a Content object, not an array containing a Content object for multipart requests.
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: SINGLE_ASSET_SCHEMA,
            },
        }));
        
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error calling Gemini API for image processing:", error);
        throw new Error("Failed to process image with Gemini API.");
    }
}

export async function performComplianceCheck(manuscriptText: string, rulesText: string): Promise<ComplianceFinding[]> {
    const prompt = `
        You are a meticulous compliance editor. Your task is to compare the provided 'MANUSCRIPT' against the provided 'RULES DOCUMENT'.
        
        Analyze the RULES DOCUMENT page by page to extract all submission rules (e.g., title length, affiliation format, funding disclosures, data availability, conflicts of interest, reference style, etc.).
        
        Then, carefully check the manuscript against each rule you identified.
        
        For every major rule found in the RULES DOCUMENT, provide a compliance finding according to the provided JSON schema. Be exhaustive and report on all key requirements.
        - If the manuscript complies with a rule, mark it as 'pass'.
        - If it clearly violates a rule, mark it as 'fail'.
        - If compliance is ambiguous or a potential issue is detected, mark it as 'warn'.
        - Provide exact quotes and page numbers from both documents for every finding.

        MANUSCRIPT TEXT:
        ${manuscriptText}

        RULES DOCUMENT TEXT:
        ${rulesText}
    `;

    try {
        const response = await apiCallWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: COMPLIANCE_SCHEMA,
            },
        }));
        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
    } catch (error) {
        console.error("Error calling Gemini API for compliance check:", error);
        throw new Error("Failed to perform compliance check with Gemini API.");
    }
}