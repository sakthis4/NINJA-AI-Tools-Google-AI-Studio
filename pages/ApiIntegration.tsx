
import React, { useState } from 'react';

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-gray-900 rounded-lg overflow-hidden my-4 relative">
            <div className="flex justify-between items-center px-4 py-2 bg-gray-700">
                <span className="text-xs font-semibold text-gray-300 uppercase">{language}</span>
                <button onClick={handleCopy} className="text-xs text-white bg-gray-600 hover:bg-gray-500 rounded px-2 py-1">
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre className="p-4 text-sm text-white overflow-x-auto">
                <code className={`language-${language}`}>{code}</code>
            </pre>
        </div>
    );
};

const ApiSection: React.FC<{ title: string, useCase: string, instructions: string[], model: string, nodeExample: string, schema: string }> = ({ title, useCase, instructions, model, nodeExample, schema }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-300 italic mb-4">{useCase}</p>
        
        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">Instructions</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
            {instructions.map((step, i) => <li key={i}>{step}</li>)}
        </ol>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <strong>Recommended Model:</strong> <code className="text-xs bg-gray-200 dark:bg-gray-700 p-1 rounded">{model}</code>
        </p>

        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">Node.js Example (@google/genai)</h4>
        <CodeBlock code={nodeExample} language="javascript" />

        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">Expected JSON Response Schema</h4>
        <CodeBlock code={schema} language="json" />
    </div>
);

export default function ApiIntegration() {
    const extractorNodeJs = `import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';

// Use your API key from an environment variable
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Schema for the expected response
const PAGE_METADATA_SCHEMA = { /* ... see schema below ... */ };

async function extractMetadataFromPage(imagePath) {
  try {
    const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
    const imagePart = { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } };
    const textPart = { text: "Analyze this page image. Find all assets and extract their metadata according to the schema." };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseMimeType: 'application/json',
            responseSchema: PAGE_METADATA_SCHEMA,
        },
    });

    const parsedData = JSON.parse(response.text);
    console.log(JSON.stringify(parsedData, null, 2));
    return parsedData;

  } catch (error) {
    console.error("API call failed:", error);
  }
}

extractMetadataFromPage('path/to/your/page-image.jpg');`;
    
    const extractorSchema = `{
  "type": "ARRAY",
  "items": {
    "type": "OBJECT",
    "properties": {
      "assetId": { "type": "STRING" },
      "assetType": { "type": "STRING", "enum": ["Figure", "Table", "Image", "Equation", "Map", "Graph"] },
      "preview": { "type": "STRING" },
      "altText": { "type": "STRING" },
      "keywords": { "type": "ARRAY", "items": { "type": "STRING" } },
      "taxonomy": { "type": "STRING" },
      "boundingBox": {
        "type": "OBJECT",
        "properties": {
          "x": { "type": "NUMBER" },
          "y": { "type": "NUMBER" },
          "width": { "type": "NUMBER" },
          "height": { "type": "NUMBER" }
        }
      }
    },
    "required": ["assetId", "assetType", "altText", "keywords", "taxonomy"]
  }
}`;

    const complianceNodeJs = `import { GoogleGenAI, Type } from '@google/genai';

// Use your API key from an environment variable
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Schema for the expected response
const COMPLIANCE_SCHEMA = { /* ... see schema below ... */ };

async function checkCompliance(manuscriptText, rulesText) {
  const prompt = \`
    You are a meticulous compliance editor. Compare the 'MANUSCRIPT CHUNK' against the 'RULES DOCUMENT'.
    For every rule you can verify based *only* on the chunk, provide a finding according to the JSON schema.
    MANUSCRIPT CHUNK: \${manuscriptText}
    RULES DOCUMENT TEXT: \${rulesText}
  \`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: COMPLIANCE_SCHEMA,
        },
    });

    const parsedData = JSON.parse(response.text);
    console.log(JSON.stringify(parsedData, null, 2));
    return parsedData;

  } catch (error) {
    console.error("API call failed:", error);
  }
}

const manuscriptChunk = "[Page 1] The title of this paper is not in sentence case...";
const rulesDocument = "Rule 1.1: All titles must be in sentence case.";
checkCompliance(manuscriptChunk, rulesDocument);`;

    const complianceSchema = `{
  "type": "ARRAY",
  "items": {
    "type": "OBJECT",
    "properties": {
      "checkCategory": { "type": "STRING" },
      "status": { "type": "STRING", "enum": ["pass", "fail", "warn"] },
      "summary": { "type": "STRING" },
      "manuscriptQuote": { "type": "STRING" },
      "manuscriptPage": { "type": "NUMBER" },
      "ruleContent": { "type": "STRING" },
      "rulePage": { "type": "NUMBER" },
      "recommendation": { "type": "STRING" }
    },
    "required": ["checkCategory", "status", "summary", "recommendation"]
  }
}`;


    return (
        <div className="animate-fade-in">
            <h2 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">API Integration Guide</h2>
            <p className="mb-6 text-gray-600 dark:text-gray-400">
                Integrate the core functionalities of this application directly into your own services, such as a Content Management System (CMS) or an automated publishing pipeline.
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 p-4 rounded-r-lg mb-8">
                <h3 className="text-lg font-bold text-blue-800 dark:text-blue-300 mb-2">Security-First Architecture</h3>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                    This application is built with a secure backend proxy model as a core design principle. Your API key is never exposed to the client-side, ensuring your credentials and data are always protected.
                </p>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">1. Authentication</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    All API requests must be authenticated with a Google Gemini API key. Obtain your key from Google AI Studio.
                    Your API key should be treated as a secret and stored securely in an environment variable on your server.
                    <strong className="text-red-500"> Never expose your API key in client-side code.</strong>
                </p>
                <CodeBlock code={`// Example for Node.js
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });`} language="javascript" />
            </div>

            <ApiSection
                title="2. Endpoint: Metadata Extraction"
                useCase="Use Case: Automatically enrich assets with metadata upon upload to your Digital Asset Management (DAM) system."
                instructions={[
                    "Convert each page of your source PDF into a JPEG image.",
                    "For each page image, convert it to a base64-encoded string.",
                    "Send the base64 string and the text prompt to the Gemini API as shown in the example.",
                    "Parse the JSON response, which will be an array of asset objects found on that page.",
                    "Store the extracted metadata alongside your asset in your system."
                ]}
                model="gemini-2.5-flash"
                nodeExample={extractorNodeJs}
                schema={extractorSchema}
            />

            <ApiSection
                title="3. Endpoint: Compliance Checking"
                useCase="Use Case: Integrate an automated pre-flight check into your manuscript submission portal to provide authors with instant feedback."
                instructions={[
                    "Extract the full text content from the author's manuscript PDF.",
                    "Concatenate the text content of all your rule documents into a single string.",
                    "For large manuscripts, split the text into smaller chunks (e.g., 20-25 pages of text per chunk) to ensure reliable processing.",
                    "For each chunk, construct a prompt containing both the manuscript chunk and the full rules text, then send it to the Gemini API.",
                    "Combine the JSON array responses from all chunks to build the complete compliance report."
                ]}
                model="gemini-2.5-pro"
                nodeExample={complianceNodeJs}
                schema={complianceSchema}
            />

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">4. Best Practices: Rate Limiting</h3>
                 <p className="text-sm text-gray-600 dark:text-gray-400">
                    The Gemini API has rate limits to ensure fair usage. If you plan to process many documents in batches, it's crucial to handle potential rate limit errors (HTTP 429).
                    Implement a retry mechanism with exponential backoff in your server-side code to gracefully handle these situations and ensure your processing jobs complete successfully. The application's internal `geminiService.ts` contains an example of such a retry mechanism.
                </p>
            </div>
        </div>
    );
}
