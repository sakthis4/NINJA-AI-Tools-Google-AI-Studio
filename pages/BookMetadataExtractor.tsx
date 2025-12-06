import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppContext } from '../hooks/useAppContext';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import {
    ChevronLeftIcon, DownloadIcon, XIcon,
    TrashIcon, FolderIcon, PlusCircleIcon, UploadIcon, ClipboardListIcon, ShieldCheckIcon, DocumentTextIcon
} from '../components/icons/Icons';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { extractBookMetadata } from '../services/aiService';
import { BookFile, BookFileStatus, BookProjectFolder } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

async function extractTextFromFile(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => 'str' in item ? item.str : '').join(' ');
            fullText += `[Page ${i}]\n${pageText}\n\n`;
        }
        return fullText;
    } else {
        throw new Error(`Unsupported file type: ${file.name}. Please upload a PDF file.`);
    }
}

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-slate-900 rounded-lg overflow-hidden my-4 relative">
            <div className="flex justify-between items-center px-4 py-2 bg-slate-700">
                <span className="text-xs font-semibold text-slate-300 uppercase">{language}</span>
                <button onClick={handleCopy} className="text-xs text-white bg-slate-600 hover:bg-slate-500 rounded px-2 py-1">
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
            <pre className="p-4 text-sm text-white overflow-x-auto max-h-96">
                <code>{code}</code>
            </pre>
        </div>
    );
};

const BookMetadataExtractor: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser, addUsageLog, setStatusBarMessage, currentUserData, createBookFolder, deleteBookFolder, addBookFilesToFolder, updateBookFile, deleteBookFile } = useAppContext();
    const folders = currentUserData?.bookFolders || [];
    
    const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
    const [currentBook, setCurrentBook] = useState<{ folderId: string, bookId: string } | null>(null);
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const transientFiles = useRef<Map<string, File>>(new Map());

    const [modal, setModal] = useState<'createFolder' | 'viewLogs' | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [selectedModel, setSelectedModel] = useState(currentUser?.canUseProModel ? 'gemini-3-pro-preview' : 'gemini-2.5-flash');

    const addLog = useCallback((bookId: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        const bookFile = folders.flatMap(f => f.bookFiles).find(b => b.id === bookId);
        if (bookFile) {
            updateBookFile(bookId, { logs: [...(bookFile.logs || []), formattedMessage] });
        }
    }, [folders, updateBookFile]);

    const onDrop = useCallback((acceptedFiles: File[], folderId: string) => {
        const newBookFiles: BookFile[] = acceptedFiles.map(file => {
            const id = `${performance.now()}-${file.name}`;
            transientFiles.current.set(id, file);
            return { id, name: file.name, status: 'queued', logs: [], progress: 0 };
        });
        addBookFilesToFolder(folderId, newBookFiles);
        setProcessingQueue(prev => [...prev, ...newBookFiles.map(m => m.id)]);
        setStatusBarMessage(`${newBookFiles.length} file(s) added to queue.`, 'info');
    }, [setStatusBarMessage, addBookFilesToFolder]);

    useEffect(() => {
        const processNextInQueue = async () => {
            if (isProcessing || processingQueue.length === 0) return;
            setIsProcessing(true);
            const bookId = processingQueue[0];
            const bookFile = folders.flatMap(f => f.bookFiles).find(p => p.id === bookId);
            const fileObject = transientFiles.current.get(bookId);

            if (!bookFile || !fileObject) {
                addLog(bookId, "ERROR: File object not found for processing.");
                updateBookFile(bookId, { status: 'error' });
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }
            
            updateBookFile(bookId, { status: 'processing', progress: 0 });
            addLog(bookId, "Processing started.");
            try {
                addLog(bookId, "Extracting full text from PDF...");
                updateBookFile(bookId, { progress: 25 });
                const manuscriptText = await extractTextFromFile(fileObject);
                addLog(bookId, `Text extracted. Sending to AI for metadata generation...`);
                updateBookFile(bookId, { progress: 50 });

                const metadata = await extractBookMetadata(manuscriptText, selectedModel);
                
                addLog(bookId, "Metadata successfully generated.");
                updateBookFile(bookId, {
                    status: 'completed',
                    progress: 100,
                    onixMetadata: metadata.onix,
                    marcMetadata: metadata.marc
                });
                
                addUsageLog({ 
                    userId: currentUser!.id, 
                    toolName: 'Book Metadata Extractor', 
                    modelName: selectedModel,
                    outputId: bookId,
                    outputName: fileObject.name,
                });

            } catch (error) {
                addLog(bookId, `FATAL ERROR: ${error instanceof Error ? error.message : "Unknown"}`);
                updateBookFile(bookId, { status: 'error' });
            } finally {
                setIsProcessing(false);
                setProcessingQueue(q => q.slice(1));
            }
        };
        processNextInQueue();
    }, [processingQueue, isProcessing, folders, addUsageLog, currentUser, addLog, updateBookFile, selectedModel]);
    
    if (view === 'editor' && currentBook) {
        const folder = folders.find(f => f.id === currentBook.folderId);
        const bookFile = folder?.bookFiles.find(p => p.id === currentBook.bookId);
        if (folder && bookFile) {
            return <EditorView bookFile={bookFile} onBack={() => setView('dashboard')} />;
        }
    }

    return (
        <div className="animate-fade-in h-full flex flex-col p-4 md:p-6 lg:p-8 bg-slate-100 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 mr-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Book & Journal Metadata Extractor</h2>
                        <p className="text-sm text-slate-500">Generate ONIX and MARC records from PDF files.</p>
                    </div>
                </div>
                <button onClick={() => setModal('createFolder')} className="flex items-center px-3 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 shadow"><FolderIcon className="h-5 w-5 mr-2"/>New Project</button>
            </div>
            
            <div className="flex-grow overflow-y-auto">
                <section className="space-y-4 animate-fade-in">
                     {folders.length === 0 ? (
                        <div className="text-center py-16 px-4 border-2 border-dashed rounded-lg">
                            <FolderIcon className="mx-auto h-12 w-12 text-slate-400" />
                            <h3 className="mt-2 text-lg font-medium text-slate-800 dark:text-slate-200">No Projects Yet</h3>
                            <p className="mt-1 text-sm text-slate-500">Create a project to upload and process your books or journals.</p>
                        </div>
                     ) : (
                        folders.map(f => <FolderCard key={f.id} folder={f} onDelete={deleteBookFolder} onFileDelete={(bookId) => deleteBookFile(f.id, bookId)} onDrop={(files) => onDrop(files, f.id)} onView={(bookId) => {setCurrentBook({ folderId: f.id, bookId }); setView('editor');}} onShowLogs={(book) => {/* TODO */}} />)
                     )}
                </section>
            </div>

            <Modal isOpen={modal === 'createFolder'} onClose={() => setModal(null)} title="Create New Project Folder">
                 <form onSubmit={(e) => { e.preventDefault(); if(newFolderName.trim()) { createBookFolder(newFolderName.trim()); setNewFolderName(''); setModal(null); } }} className="space-y-4">
                    <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="E.g., Spring 2025 Catalog" className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600" />
                    <div className="flex justify-end mt-4 space-x-2"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 rounded-md">Cancel</button><button type="submit" className="px-4 py-2 bg-green-500 text-white rounded-md">Create</button></div>
                </form>
            </Modal>
        </div>
    );
};

const FolderCard: React.FC<{ folder: BookProjectFolder; isExpanded?: boolean; onDelete: (id: string) => void; onFileDelete: (id: string) => void; onDrop: (files: File[]) => void; onView: (bookId: string) => void; onShowLogs: (book: BookFile) => void; }> = ({ folder, onDelete, onFileDelete, onDrop, onView, onShowLogs }) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md transition-all duration-300">
            <div className="w-full p-4 flex justify-between items-center text-left">
                <div className="flex items-center gap-3"><FolderIcon className="h-6 w-6 text-green-500" /><p className="font-bold text-lg text-slate-800 dark:text-slate-100">{folder.name}</p></div>
                <button onClick={() => onDelete(folder.id)} className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon className="h-5 w-5"/></button>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <div className="space-y-2">{folder.bookFiles.map(m => <BookFileRow key={m.id} bookFile={m} onView={onView} onShowLogs={onShowLogs} onDelete={onFileDelete} />)}</div>
                <div {...getRootProps()} className="mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 text-slate-500 hover:text-green-600 dark:hover:text-green-400 transition-colors">
                    <input {...getInputProps()} />
                    <UploadIcon className="h-8 w-8 mx-auto" />
                    <p className="mt-2 text-sm">Upload Book or Journal PDF</p>
                    <div className="mt-2 flex items-center justify-center text-xs text-slate-500">
                        <ShieldCheckIcon className="h-4 w-4 mr-1.5 text-green-500"/>
                        <span>Your files are processed securely.</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const BookFileRow: React.FC<{ bookFile: BookFile; onView: (id: string) => void; onShowLogs: (book: BookFile) => void; onDelete: (id: string) => void; }> = ({ bookFile, onView, onShowLogs, onDelete }) => {
    const statusStyles = { queued: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200', processing: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200', completed: 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200', error: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200' };
    return (
        <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-md">
            <div className="flex justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{bookFile.name}</p>
                    <div className="mt-1"><span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[bookFile.status]}`}>{bookFile.status}</span></div>
                </div>
                <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                    {bookFile.status === 'completed' && <button onClick={() => onView(bookFile.id)} className="px-2 py-1 text-xs font-semibold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/50 rounded-md hover:bg-green-200 dark:hover:bg-green-900">View Metadata</button>}
                    <button onClick={() => onShowLogs(bookFile)} title="View Logs" className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full"><ClipboardListIcon className="h-4 w-4"/></button>
                    <button onClick={() => onDelete(bookFile.id)} title="Delete" className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><TrashIcon className="h-4 w-4"/></button>
                </div>
            </div>
            {bookFile.status === 'processing' && <div className="mt-2"><div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-1.5"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${bookFile.progress || 0}%` }}></div></div></div>}
        </div>
    );
};

const EditorView: React.FC<{ bookFile: BookFile; onBack: () => void }> = ({ bookFile, onBack }) => {
    const [activeTab, setActiveTab] = useState<'onix' | 'marc'>('onix');
    const { setStatusBarMessage } = useAppContext();

    const handleDownload = (format: 'onix' | 'marc') => {
        const content = format === 'onix' ? bookFile.onixMetadata : bookFile.marcMetadata;
        const mimeType = format === 'onix' ? 'application/xml' : 'text/plain';
        const fileExtension = format === 'onix' ? 'xml' : 'mrc';
        if (!content) {
            setStatusBarMessage('No content to download.', 'error');
            return;
        }

        const blob = new Blob([content], { type: mimeType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${bookFile.name}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        setStatusBarMessage(`Downloading ${format.toUpperCase()} file.`, 'success');
    };

    return (
        <div className="h-full flex flex-col p-4 md:p-6 lg:p-8">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 mr-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Metadata for: {bookFile.name}</h2>
                        <p className="text-sm text-slate-500">Review the generated ONIX and MARC records.</p>
                    </div>
                </div>
            </div>

            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
                <button onClick={() => setActiveTab('onix')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'onix' ? 'border-b-2 border-green-500 text-green-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>ONIX 3.0</button>
                <button onClick={() => setActiveTab('marc')} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'marc' ? 'border-b-2 border-green-500 text-green-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>MARC21</button>
            </div>

            <div className="flex-grow overflow-y-auto">
                {activeTab === 'onix' && (
                    <div className="animate-fade-in">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold">ONIX 3.0 Record (XML)</h3>
                            <button onClick={() => handleDownload('onix')} className="flex items-center px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600"><DownloadIcon className="h-4 w-4 mr-2"/>Download .xml</button>
                        </div>
                        <CodeBlock code={bookFile.onixMetadata || 'No ONIX metadata generated.'} language="xml" />
                    </div>
                )}
                {activeTab === 'marc' && (
                    <div className="animate-fade-in">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold">MARC21 Record (Human-Readable)</h3>
                            <button onClick={() => handleDownload('marc')} className="flex items-center px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600"><DownloadIcon className="h-4 w-4 mr-2"/>Download .mrc</button>
                        </div>
                        <CodeBlock code={bookFile.marcMetadata || 'No MARC metadata generated.'} language="text" />
                    </div>
                )}
            </div>
        </div>
    );
};

export default BookMetadataExtractor;