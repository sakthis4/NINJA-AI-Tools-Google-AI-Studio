
import React, { useState, useCallback } from 'react';
import { generateComplianceReport } from './services/geminiService';
import { ComplianceReport } from './types';
import ComplianceDashboard from './components/ComplianceDashboard';
import Loader from './components/Loader';

// Type declaration for pdf.js library loaded from CDN
declare const pdfjsLib: any;

const App: React.FC = () => {
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<string>('');
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handlePdfUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);
    setPdfText(null);
    setPdfFileName(file.name);
    setReport(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (!e.target?.result) return;
        const typedarray = new Uint8Array(e.target.result as ArrayBuffer);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ');
        }
        setPdfText(fullText);
        setIsLoading(false);
      };
      reader.onerror = () => {
        setError('Failed to read the PDF file.');
        setIsLoading(false);
      }
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('An error occurred while processing the PDF.');
      setIsLoading(false);
    }
  }, []);

  const handleAnalyze = async () => {
    if (!pdfText || !checklist) {
      setError('Please upload a PDF and provide a checklist.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setReport(null);

    try {
      const result = await generateComplianceReport(pdfText, checklist);
      setReport(result);
    } catch (err) {
      console.error(err);
      setError(`Failed to generate report. ${err instanceof Error ? err.message : 'An unknown error occurred.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const isAnalyzeDisabled = !pdfText || !checklist.trim() || isLoading;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-500">
            PDF Compliance Dashboard
          </h1>
          <p className="mt-2 text-lg text-gray-400">
            Upload a document and a checklist to generate an AI-powered compliance analysis.
          </p>
        </header>

        <main className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
              <h2 className="text-2xl font-bold mb-4 text-cyan-400">1. Upload Document</h2>
              <label htmlFor="pdf-upload" className="w-full inline-block bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg cursor-pointer transition duration-300 text-center">
                {pdfFileName ? 'Change PDF' : 'Select PDF File'}
              </label>
              <input id="pdf-upload" type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
              {pdfFileName && <p className="mt-4 text-green-400 text-center">✓ {pdfFileName} uploaded successfully.</p>}
            </div>

            <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700">
              <h2 className="text-2xl font-bold mb-4 text-cyan-400">2. Provide Checklist</h2>
              <textarea
                value={checklist}
                onChange={(e) => setChecklist(e.target.value)}
                placeholder="Enter each checklist item on a new line..."
                className="w-full h-40 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition duration-300"
              />
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzeDisabled}
              className={`px-8 py-3 font-bold text-lg rounded-full transition-all duration-300 transform hover:scale-105 ${
                isAnalyzeDisabled
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-lg hover:shadow-cyan-500/50'
              }`}
            >
              {isLoading ? 'Analyzing...' : 'Generate Compliance Report'}
            </button>
          </div>
          
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-center" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <div className="mt-12">
            {isLoading && !report && <Loader />}
            {report && <ComplianceDashboard report={report} />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
