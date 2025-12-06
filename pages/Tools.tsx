import React, { useState } from 'react';
import { MetadataExtractor } from './MetadataExtractor';
import ImageMetadataExtractor from './ImageMetadataExtractor';
import JournalComplianceChecker from './JournalComplianceChecker';
import BookComplianceChecker from './BookComplianceChecker';
import { SparklesIcon, PhotographIcon, ComplianceIcon, ManuscriptCheckIcon, BookOpenIcon } from '../components/icons/Icons';
import BookMetadataExtractor from './BookMetadataExtractor';

export default function Tools() {
  const [activeTool, setActiveTool] = useState<'pdf' | 'image' | 'journal-compliance' | 'book-compliance' | 'book-metadata' | null>(null);

  if (activeTool === 'pdf') {
    return (
      <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100%+2rem)] md:h-[calc(100%+3rem)] lg:h-[calc(100%+4rem)]">
        <MetadataExtractor onBack={() => setActiveTool(null)} />
      </div>
    );
  }

  if (activeTool === 'image') {
    return (
      <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100%+2rem)] md:h-[calc(100%+3rem)] lg:h-[calc(100%+4rem)]">
        <ImageMetadataExtractor onBack={() => setActiveTool(null)} />
      </div>
    );
  }

  if (activeTool === 'journal-compliance') {
    return (
      <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100%+2rem)] md:h-[calc(100%+3rem)] lg:h-[calc(100%+4rem)]">
        <JournalComplianceChecker onBack={() => setActiveTool(null)} />
      </div>
    );
  }
  
  if (activeTool === 'book-compliance') {
    return (
      <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100%+2rem)] md:h-[calc(100%+3rem)] lg:h-[calc(100%+4rem)]">
        <BookComplianceChecker onBack={() => setActiveTool(null)} />
      </div>
    );
  }

  if (activeTool === 'book-metadata') {
    return (
      <div className="-m-4 md:-m-6 lg:-m-8 h-[calc(100%+2rem)] md:h-[calc(100%+3rem)] lg:h-[calc(100%+4rem)]">
        <BookMetadataExtractor onBack={() => setActiveTool(null)} />
      </div>
    );
  }
  
  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Tools Dashboard</h2>
        <p className="text-slate-500 mt-1">Select a tool to begin your AI-powered workflow.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* PDF Asset Analyzer Card */}
        <div className="group relative bg-white dark:bg-slate-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-sky-500/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div className="p-6 flex flex-col justify-between h-full relative">
            <div>
              <div className="p-3 bg-sky-100 dark:bg-sky-900/50 rounded-lg inline-block mb-4">
                <SparklesIcon className="h-8 w-8 text-sky-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">PDF Asset Analyzer</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 mb-6">
                Analyzes PDF documents to generate accessible metadata like alt text, keywords, and taxonomy for all figures, tables, and images.
              </p>
            </div>
            <button
              onClick={() => setActiveTool('pdf')}
              className="w-full bg-sky-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 dark:focus:ring-offset-slate-800 transition-colors duration-300"
            >
              Launch Tool
            </button>
          </div>
        </div>
        
        {/* Image Metadata Generator Card */}
        <div className="group relative bg-white dark:bg-slate-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-indigo-500/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div className="p-6 flex flex-col justify-between h-full relative">
            <div>
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg inline-block mb-4">
                <PhotographIcon className="h-8 w-8 text-indigo-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Image Metadata Generator</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 mb-6">
                Upload images (JPG, PNG) to automatically generate accessible metadata including alt text, keywords, and taxonomy.
              </p>
            </div>
            <button
              onClick={() => setActiveTool('image')}
              className="w-full bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-800 transition-colors duration-300"
            >
              Launch Tool
            </button>
          </div>
        </div>
        
        {/* Journal Compliance Checker Card */}
        <div className="group relative bg-white dark:bg-slate-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-purple-500/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div className="p-6 flex flex-col justify-between h-full relative">
            <div>
              <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg inline-block mb-4">
                <ComplianceIcon className="h-8 w-8 text-purple-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Journal Compliance Checker</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 mb-6">
                A comprehensive tool that checks manuscripts against journal guidelines, analyzes for editorial issues, and provides AI-powered submission recommendations.
              </p>
            </div>
            <button
              onClick={() => setActiveTool('journal-compliance')}
              className="w-full bg-purple-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 dark:focus:ring-offset-slate-800 transition-colors duration-300"
            >
              Launch Tool
            </button>
          </div>
        </div>
        
        {/* Book Metadata Extractor Card */}
        <div className="group relative bg-white dark:bg-slate-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-green-500/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div className="p-6 flex flex-col justify-between h-full relative">
            <div>
              <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg inline-block mb-4">
                <BookOpenIcon className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Book & Journal Metadata Extractor</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 mb-6">
                Analyzes a full book or journal PDF to generate comprehensive, distribution-ready metadata in ONIX and MARC formats.
              </p>
            </div>
            <button
              onClick={() => setActiveTool('book-metadata')}
              className="w-full bg-green-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dark:focus:ring-offset-slate-800 transition-colors duration-300"
            >
              Launch Tool
            </button>
          </div>
        </div>
        
        {/* Book Compliance Checker Card */}
        <div className="group relative bg-white dark:bg-slate-800 rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden transform hover:-translate-y-1">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-yellow-500/20 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
          <div className="p-6 flex flex-col justify-between h-full relative">
            <div>
              <div className="p-3 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg inline-block mb-4">
                <ManuscriptCheckIcon className="h-8 w-8 text-yellow-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Book Compliance Checker</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 mb-6">
                An all-in-one tool to validate book manuscripts against publisher guidelines, analyze chapter structure, check readability, and identify editorial issues.
              </p>
            </div>
            <button
              onClick={() => setActiveTool('book-compliance')}
              className="w-full bg-yellow-500 text-white font-semibold py-2.5 px-4 rounded-lg hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 dark:focus:ring-offset-slate-800 transition-colors duration-300"
            >
              Launch Tool
            </button>
          </div>
        </div>


      </div>
    </div>
  );
}