
import React, { useState } from 'react';

const CodeBlock = ({ code, language }: { code: string; language: string }) => {
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

const ApiSection = ({ title, description, model, curlExample, jsExample, schema }: { title: string, description: string, model: string, curlExample: string, jsExample: string, schema: string }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{description}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            <strong>Gemini Model:</strong> <code className="text-xs bg-gray-200 dark:bg-gray-700 p-1 rounded">{model}</code>
        </p>

        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">cURL Request</h4>
        <CodeBlock code={curlExample} language="bash" />

        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">JavaScript (fetch)</h4>
        <CodeBlock code={jsExample} language="javascript" />

        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">Expected JSON Response Schema</h4>
        <CodeBlock code={schema} language="json" />
    </div>
);

export default function ApiIntegration() {
    const extractorCurl = `curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
      "contents": {
        "parts": [
          { "inlineData": { "mimeType": "image/jpeg", "data": "BASE64_ENCODED_IMAGE_STRING" } },
          { "text": "Analyze this page image. Find all assets (figures, tables, etc.) and extract metadata according to the schema." }
        ]
      },
      "config": {
        "responseMimeType": "application/json",
        "responseSchema": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "assetId": {"type": "STRING"},
              "assetType": {"type": "STRING", "enum": ["Figure", "Table", "Image", "Equation", "Map", "Graph"]},
              "altText": {"type": "STRING"},
              "keywords": {"type": "ARRAY", "items": {"type": "STRING"}},
              "taxonomy": {"type": "STRING"}
            }
          }
        }
      }
    }'`;

    const extractorJs = `const apiKey = 'YOUR_API_KEY';
const url = \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\${apiKey}\`;

const body = {
  // ... (see cURL example for the full body structure)
};

async function extractMetadata() {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  console.log(data.text);
}

extractMetadata();`;
    
    const extractorSchema = `{
  "type": "ARRAY",
  "items": {
    "type": "OBJECT",
    "properties": {
      "assetId": { "type": "STRING" },
      "assetType": { "type": "STRING" },
      "altText": { "type": "STRING" },
      "keywords": { "type": "ARRAY" },
      "taxonomy": { "type": "STRING" }
    },
    "required": ["assetId", "assetType", "altText", "keywords", "taxonomy"]
  }
}`;

    const complianceCurl = `curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=YOUR_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{
      "contents": "You are a compliance editor. Compare the MANUSCRIPT CHUNK against the RULES DOCUMENT...\\n\\nMANUSCRIPT CHUNK:\\n[Page 1] The quick brown fox...\\n\\nRULES DOCUMENT TEXT:\\nAll titles must be in sentence case...",
      "config": {
        "responseMimeType": "application/json",
        "responseSchema": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "checkCategory": {"type": "STRING"},
              "status": {"type": "STRING", "enum": ["pass", "fail", "warn"]},
              "summary": {"type": "STRING"},
              "recommendation": {"type": "STRING"}
            }
          }
        }
      }
    }'`;

    const complianceJs = `const apiKey = 'YOUR_API_KEY';
const url = \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=\${apiKey}\`;

const body = {
  // ... (see cURL example for the full body structure)
};

async function checkCompliance() {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  console.log(data.text);
}

checkCompliance();`;

    const complianceSchema = `{
  "type": "ARRAY",
  "items": {
    "type": "OBJECT",
    "properties": {
      "checkCategory": { "type": "STRING" },
      "status": { "type": "STRING" },
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
                Integrate the core functionalities of this application into your own services by calling the Google Gemini API directly.
            </p>

            <ApiSection
                title="Metadata Extraction from PDF/Image"
                description="This endpoint analyzes a single page (as an image) from a document to extract metadata for all assets it contains. The model returns a structured JSON object based on the provided schema."
                model="gemini-2.5-flash"
                curlExample={extractorCurl}
                jsExample={extractorJs}
                schema={extractorSchema}
            />

            <ApiSection
                title="Compliance Checker"
                description="This endpoint compares a chunk of manuscript text against a set of rules to find compliance issues. For best results with large documents, send the manuscript text in chunks (e.g., 20-30 pages at a time)."
                model="gemini-2.5-pro"
                curlExample={complianceCurl}
                jsExample={complianceJs}
                schema={complianceSchema}
            />
        </div>
    );
}