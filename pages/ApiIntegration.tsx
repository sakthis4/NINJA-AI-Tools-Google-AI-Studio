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

const ApiSection: React.FC<{ title: string, useCase: string, instructions: string[], apiExample: string, schema: string }> = ({ title, useCase, instructions, apiExample, schema }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-300 italic mb-4">{useCase}</p>
        
        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">Instructions</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
            {instructions.map((step, i) => <li key={i}>{step}</li>)}
        </ol>

        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">Example API Request</h4>
        <CodeBlock code={apiExample} language="bash" />

        <h4 className="font-semibold mt-6 mb-2 text-gray-800 dark:text-gray-200">Expected JSON Response Schema</h4>
        <CodeBlock code={schema} language="json" />
    </div>
);

export default function ApiIntegration() {
    const extractorApiExample = `curl -X POST https://your-backend.com/api/extract-metadata \\
     -H "Authorization: Bearer YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{
       "page_image_base64": "...",
       "prompt": "Analyze this page image. Find all assets and extract their metadata according to the schema."
     }'`;
    
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

    const complianceApiExample = `curl -X POST https://your-backend.com/api/check-compliance \\
     -H "Authorization: Bearer YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{
       "manuscript_chunk": "[Page 1] The title...",
       "rules_document": "Rule 1.1: All titles must be in sentence case."
     }'`;

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
            <h2 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">Service Integration Guide</h2>
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
                    All API requests to your backend service must be authenticated with an API key. This key should be provided by your administrator.
                    Your backend will then use its own securely stored API key to communicate with the underlying AI service.
                    <strong className="text-red-500"> Never expose your service or AI provider API keys in client-side code.</strong>
                </p>
            </div>

            <ApiSection
                title="2. Endpoint: Metadata Extraction"
                useCase="Use Case: Automatically enrich assets with metadata upon upload to your Digital Asset Management (DAM) system."
                instructions={[
                    "On your backend, create an endpoint (e.g., /api/extract-metadata).",
                    "Convert each page of your source PDF into a JPEG image and send it as a base64-encoded string in the request body.",
                    "Your backend service will forward this to the AI API, receive the structured JSON, and return it to your application.",
                    "Store the extracted metadata alongside your asset in your system."
                ]}
                apiExample={extractorApiExample}
                schema={extractorSchema}
            />

            <ApiSection
                title="3. Endpoint: Compliance Checking"
                useCase="Use Case: Integrate an automated pre-flight check into your manuscript submission portal to provide authors with instant feedback."
                instructions={[
                    "On your backend, create an endpoint (e.g., /api/check-compliance).",
                    "Extract the full text from the manuscript and your rule documents.",
                    "For large manuscripts, split the text into smaller chunks (e.g., 20-25 pages of text per chunk) to ensure reliable processing.",
                    "For each chunk, send a request to your endpoint containing both the manuscript chunk and the full rules text.",
                    "Your backend will call the AI service and return the JSON findings, which you can then aggregate to build the complete report."
                ]}
                apiExample={complianceApiExample}
                schema={complianceSchema}
            />

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mb-8">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">4. Best Practices: Rate Limiting</h3>
                 <p className="text-sm text-gray-600 dark:text-gray-400">
                    The underlying AI service has rate limits. If you plan to process many documents in batches, it's crucial to handle potential rate limit errors (HTTP 429) and server availability errors (HTTP 503).
                    Implement a retry mechanism with exponential backoff in your backend service to gracefully handle these situations and ensure your processing jobs complete successfully.
                </p>
            </div>
        </div>
    );
}