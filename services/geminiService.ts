
import { GoogleGenAI, Type } from '@google/genai';
import { ComplianceReport, ComplianceStatus } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const complianceStatusValues = Object.values(ComplianceStatus);

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      checklistItem: {
        type: Type.STRING,
        description: 'The exact checklist item being evaluated.',
      },
      status: {
        type: Type.STRING,
        description: `The compliance status. Must be one of: ${complianceStatusValues.join(', ')}.`,
      },
      evidence: {
        type: Type.STRING,
        description: 'A direct quote from the document text that supports the status. If no direct evidence is found, state that explicitly.',
      },
      reasoning: {
        type: Type.STRING,
        description: 'A brief explanation for the compliance assessment, detailing why the evidence supports the given status.',
      },
    },
    required: ['checklistItem', 'status', 'evidence', 'reasoning'],
  },
};

export const generateComplianceReport = async (pdfText: string, checklist: string): Promise<ComplianceReport> => {
  const model = 'gemini-2.5-pro';

  const prompt = `
    DOCUMENT TEXT:
    ---
    ${pdfText.substring(0, 900000)}
    ---
    CHECKLIST:
    ---
    ${checklist}
    ---
  `;
  
  const systemInstruction = `You are a meticulous compliance auditor. Your task is to analyze the provided document text against the given checklist.
  For each item in the checklist, you must determine if the document is compliant, partially compliant, not compliant, or if the item is not applicable.
  Provide direct quotes from the text as evidence and a brief reasoning for your assessment.
  You MUST return your findings as a valid JSON array that conforms to the provided schema. Each object in the array represents one item from the checklist.
  Ensure the 'status' field for each item is one of the following exact strings: ${complianceStatusValues.join(', ')}.`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema,
        temperature: 0.2,
      },
    });

    const jsonText = response.text.trim();
    const result = JSON.parse(jsonText) as ComplianceReport;
    
    // Validate the parsed data
    if (!Array.isArray(result)) {
        throw new Error("API returned a non-array response.");
    }

    return result;

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    if (error instanceof Error) {
        throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error('An unknown error occurred while communicating with the Gemini API.');
  }
};
