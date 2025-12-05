
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppContext } from '../hooks/useAppContext';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import {
    ChevronLeftIcon, DownloadIcon, XIcon, ExclamationIcon, InfoIcon,
    TrashIcon, FolderIcon, PlusCircleIcon, UploadIcon, ClipboardListIcon, ShieldCheckIcon, DocumentTextIcon, ChevronDownIcon
} from '../components/icons/Icons';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeManuscript } from '../services/geminiService';
import {
    ManuscriptIssue, ManuscriptIssuePriority, ProjectFolder, ManuscriptFile, ManuscriptStatus
} from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

async function extractTextFromPdf(pdfDoc: pdfjsLib.PDFDocumentProxy): Promise<string> {
    let fullText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => 'str' in item ? item.str : '').join(' ');
        fullText += `[Page ${i}]\n${pageText}\n\n`;
    }
    return fullText;
}

const renderPriorityVisuals = (priority: ManuscriptIssuePriority) => {
    const styles = { High: 'text-red-400 bg-red-900/50 border-red-500/50', Medium: 'text-yellow-400 bg-yellow-900/50 border-yellow-500/50', Low: 'text-sky-400 bg-sky-900/50 border-sky-500/50' };
    const Icon = { High: ExclamationIcon, Medium: ExclamationIcon, Low: InfoIcon }[priority];
    return {
        icon: <div className={`p-2 rounded-full border ${styles[priority]}`}><Icon className="h-6 w-6" /></div>,
        tag: <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${styles[priority].replace('text-', 'bg-').replace('/50', '/30').replace('border-red-500/50', '')}`}>{priority}</span>
    };
};

const ManuscriptStatusIndicator: React.FC<{ status: ManuscriptStatus }> = ({ status }) => {
    const styles = { queued: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200', processing: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200', completed: 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200', error: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200' };
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>{status}</span>;
};

const ManuscriptAnalyzer: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser, addUsageLog, setStatusBarMessage, currentUserData, createComplianceFolder, deleteComplianceFolder, addManuscriptsToFolder, updateManuscript, deleteManuscript } = useAppContext();
    const folders = currentUserData?.complianceFolders || [];
    
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    const transientFiles = useRef<Map<string, File>>(new Map());

    const [modal, setModal] = useState<'createFolder' | 'viewReport' | 'viewLogs' | null>(null);
    const [selectedManuscript, setSelectedManuscript] = useState<ManuscriptFile | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [selectedModel, setSelectedModel] = useState(currentUser?.canUseProModel ? 'gemini-3-pro-preview' : 'gemini-2.5-flash');

    const addAnalysisLog = useCallback((manuscriptId: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        const manuscript = folders.flatMap(f => f.manuscripts).find(m => m.id === manuscriptId);
        if (manuscript) {
            updateManuscript(manuscriptId, { logs: [...(manuscript.logs || []), formattedMessage] });
        }
    }, [folders, updateManuscript]);

    const onManuscriptsDrop = useCallback((acceptedFiles: File[], folderId: string) => {
        const newManuscripts: ManuscriptFile[] = acceptedFiles.map(file => {
            const id = Math.random().toString(36).substring(2, 9);
            transientFiles.current.set(id, file);
            return { id, name: file.name, status: 'queued', logs: [], progress: 0 };
        });
        addManuscriptsToFolder(folderId, newManuscripts);
        setProcessingQueue(prev => [...prev, ...newManuscripts.map(m => m.id)]);
        setStatusBarMessage(`${newManuscripts.length} manuscript(s) added to queue.`, 'info');
    }, [setStatusBarMessage, addManuscriptsToFolder]);

    useEffect(() => {
        const processNextInQueue = async () => {
            if (isProcessing || processingQueue.length === 0) return;
            setIsProcessing(true);
            const manuscriptId = processingQueue[0];
            const manuscript = folders.flatMap(f => f.manuscripts).find(m => m.id === manuscriptId);
            const fileObject = transientFiles.current.get(manuscriptId);
            
            if (!manuscript || !fileObject) {
                addAnalysisLog(manuscriptId, "ERROR: File content not found.");
                updateManuscript(manuscriptId, { status: 'error' });
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }
            
            updateManuscript(manuscriptId, { status: 'processing', progress: 0 });
            addAnalysisLog(manuscriptId, "Processing started.");
            try {
                addAnalysisLog(manuscriptId, "Extracting text from manuscript...");
                const manuscriptDoc = await pdfjsLib.getDocument({ data: new Uint8Array(await fileObject.arrayBuffer()) }).promise;
                const manuscriptText = await extractTextFromPdf(manuscriptDoc);
                
                const CHUNK_SIZE_PAGES = 25;
                const pageChunks = manuscriptText.split(/(?=\[Page \d+\])/g);
                const textChunks = pageChunks.reduce((acc, chunk, i) => (i % CHUNK_SIZE_PAGES ? acc[acc.length - 1] += chunk : acc.push(chunk), acc), [] as string[]);
                addAnalysisLog(manuscriptId, `Split into ${textChunks.length} chunks.`);

                let allFindings: ManuscriptIssue[] = [];
                for (const [index, chunk] of textChunks.entries()) {
                    updateManuscript(manuscriptId, { progress: Math.round(((index + 1) / textChunks.length) * 100) });
                    addAnalysisLog(manuscriptId, `Processing chunk ${index + 1}/${textChunks.length}...`);
                    try {
                        const reportForChunk = await analyzeManuscript(chunk, selectedModel);
                        if (reportForChunk.length > 0) {
                            addAnalysisLog(manuscriptId, `Found ${reportForChunk.length} potential issues in chunk ${index + 1}.`);
                            allFindings.push(...reportForChunk);
                        }
                    } catch (chunkError) { addAnalysisLog(manuscriptId, `ERROR processing chunk ${index + 1}: ${chunkError instanceof Error ? chunkError.message : "Unknown"}`); }
                    if (index < textChunks.length - 1) await new Promise<void>(resolve => setTimeout(() => resolve(undefined), 1500));
                }

                addAnalysisLog(manuscriptId, `API calls successful. Found ${allFindings.length} items.`);
                addUsageLog({ 
                    userId: currentUser!.id, 
                    toolName: 'Manuscript Analyzer', 
                    modelName: selectedModel,
                    outputId: manuscriptId,
                    outputName: fileObject.name,
                });
                updateManuscript(manuscriptId, { status: 'completed', analysisReport: allFindings, progress: 100 });
            } catch (error) {
                addAnalysisLog(manuscriptId, `FATAL ERROR: ${error instanceof Error ? error.message : "Unknown"}`);
                updateManuscript(manuscriptId, { status: 'error' });
            } finally {
                setIsProcessing(false);
                setProcessingQueue(q => q.slice(1));
            }
        };
        processNextInQueue();
    }, [processingQueue, isProcessing, folders, addUsageLog, currentUser, addAnalysisLog, updateManuscript, selectedModel]);

    const handleDownloadLog = (manuscript: ManuscriptFile) => {
        const fileName = `${manuscript.name}_analysis.log.txt`;
        let content = `MANUSCRIPT ANALYSIS LOG\nFile: ${manuscript.name}\nStatus: ${manuscript.status}\n\nPROCESS LOG:\n${(manuscript.logs || []).join('\n')}\n\n---\n\nANALYSIS REPORT:\n\n`;
        (manuscript.analysisReport || []).forEach(f => {
            content += `[${f.priority.toUpperCase()}] ${f.issueCategory}\n- Summary: ${f.summary}\n- Manuscript (p. ${f.pageNumber}): "${f.quote}"\n- Recommendation: ${f.recommendation}\n\n`;
        });
        
        const blob = new Blob([content], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        setStatusBarMessage(`Downloading log for ${manuscript.name}`, 'info');
    };

    const sortedIssues = useMemo(() => {
        if (!selectedManuscript?.analysisReport) return [];
        const priorityOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };
        return [...selectedManuscript.analysisReport].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }, [selectedManuscript]);

    return (
        <div className="animate-fade-in h-full flex flex-col p-4 md:p-6 lg:p-8 bg-slate-100 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 mr-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Manuscript Analyzer</h2>
                        <p className="text-sm text-slate-500">Check for grammar, integrity, plagiarism, and more.</p>
                    </div>
                </div>
            </div>
            
            <div className="flex-grow overflow-y-auto">
                <section className="space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-cyan-500">Project Folders</h3>
                        <button onClick={() => setModal('createFolder')} className="flex items-center px-3 py-2 text-sm bg-teal-500 text-white rounded-lg hover:bg-teal-600 shadow"><FolderIcon className="h-5 w-5 mr-2"/>Create Folder</button>
                    </div>
                     {folders.length === 0 ? (
                        <div className="text-center py-16 px-4 border-2 border-dashed rounded-lg">
                            <FolderIcon className="mx-auto h-12 w-12 text-slate-400" />
                            <h3 className="mt-2 text-lg font-medium text-slate-800 dark:text-slate-200">No Projects Yet</h3>
                            <p className="mt-1 text-sm text-slate-500">Create a project folder to upload and analyze manuscripts.</p>
                        </div>
                     ) : (
                        folders.map(f => <FolderCard key={f.id} folder={f} onExpandToggle={(id) => setExpandedSections(prev => ({...prev, [id]: !prev[id]}))} isExpanded={!!expandedSections[f.id]} onDelete={deleteComplianceFolder} onManuscriptDelete={(manId) => deleteManuscript(f.id, manId)} onDrop={(files) => onManuscriptsDrop(files, f.id)} onViewReport={(man) => {setSelectedManuscript(man); setModal('viewReport');}} onViewLogs={(man) => {setSelectedManuscript(man); setModal('viewLogs');}} onDownloadLog={handleDownloadLog} />)
                     )}
                </section>
            </div>

            <Modal isOpen={modal === 'createFolder'} onClose={() => setModal(null)} title="Create New Project Folder">
                 <form onSubmit={(e) => { e.preventDefault(); if(newFolderName.trim()) { createComplianceFolder(newFolderName.trim(), null); setNewFolderName(''); setModal(null); } }} className="space-y-4">
                    <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="E.g., Q4 Journal Submissions" className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600" />
                    <p className="text-xs text-slate-500">Project folders are shared between the Compliance Checker and Manuscript Analyzer tools.</p>
                    <div className="flex justify-end mt-4 space-x-2"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 rounded-md">Cancel</button><button type="submit" className="px-4 py-2 bg-teal-500 text-white rounded-md">Create</button></div>
                </form>
            </Modal>
            <Modal isOpen={modal === 'viewReport' && !!selectedManuscript} onClose={() => setModal(null)} title={`Analysis Report: ${selectedManuscript?.name}`}>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                     <div className="bg-yellow-900/50 border border-yellow-500/50 text-yellow-300 text-xs rounded-lg p-3">
                        <p><strong className="font-bold">Plagiarism Disclaimer:</strong> The 'Plagiarism Concern' category flags text that appears unoriginal based on the model's training data. It is not a substitute for a dedicated plagiarism detection service (e.g., Turnitin) and should be used as a guide for further review.</p>
                    </div>
                    {sortedIssues.length === 0 && <p className="text-center text-slate-500">No issues found in the analysis.</p>}
                    {sortedIssues.map((finding, index) => (
                        <div key={index} className="bg-slate-900 rounded-lg p-4">
                           <div className="flex items-start justify-between gap-4">
                                <h4 className="font-semibold text-lg mb-2 text-slate-200 flex-1">{finding.issueCategory}</h4>{renderPriorityVisuals(finding.priority).icon}
                           </div>
                           <div className="flex items-center justify-between mb-3">
                                <p className="text-sm text-slate-400 italic">"{finding.summary}"</p>
                                {renderPriorityVisuals(finding.priority).tag}
                           </div>
                           <div className="space-y-3 text-sm">
                                <p><strong className="font-medium text-teal-400">Recommendation:</strong> <span className="text-slate-300">{finding.recommendation}</span></p>
                                <p><strong className="font-medium text-teal-400">Manuscript (p. {finding.pageNumber}):</strong> <span className="text-slate-300 italic">"{finding.quote}"</span></p>
                           </div>
                        </div>
                    ))}
                    <div className="text-center pt-2"><button onClick={() => selectedManuscript && handleDownloadLog(selectedManuscript)} className="text-sm text-slate-400 hover:underline">Download Full Log</button></div>
                </div>
            </Modal>
             <Modal isOpen={modal === 'viewLogs' && !!selectedManuscript} onClose={() => setModal(null)} title={`Logs: ${selectedManuscript?.name}`}>
                <div className="bg-slate-900 text-white font-mono text-xs rounded-md p-4 max-h-96 overflow-y-auto">
                    {(selectedManuscript?.logs || []).map((log, index) => <p key={index}>{log}</p>)}
                </div>
            </Modal>
        </div>
    );
};

const ManuscriptRow: React.FC<{ manuscript: ManuscriptFile; onViewReport: (m: ManuscriptFile) => void; onViewLogs: (m: ManuscriptFile) => void; onManuscriptDelete: (id: string) => void; onDownloadLog: (m: ManuscriptFile) => void; }> = ({ manuscript, onViewReport, onViewLogs, onManuscriptDelete, onDownloadLog }) => (
    <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-md">
        <div className="flex justify-between items-center gap-4">
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{manuscript.name}</p>
                 <div className="mt-1">
                    <ManuscriptStatusIndicator status={manuscript.status} />
                </div>
            </div>
            <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                {manuscript.status === 'completed' && (
                    <>
                        <button onClick={() => onViewReport(manuscript)} className="px-2 py-1 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/50 rounded-md hover:bg-teal-200 dark:hover:bg-teal-900">View Report</button>
                        <button onClick={() => onDownloadLog(manuscript)} className="px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500 inline-flex items-center"><DownloadIcon className="h-3 w-3 mr-1.5"/>Download</button>
                    </>
                )}
                <button onClick={() => onViewLogs(manuscript)} title="View Logs" className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full"><ClipboardListIcon className="h-4 w-4"/></button>
                <button onClick={() => onManuscriptDelete(manuscript.id)} title="Delete" className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><TrashIcon className="h-4 w-4"/></button>
            </div>
        </div>
        {manuscript.status === 'processing' && <div className="mt-2"><div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-1.5"><div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${manuscript.progress || 0}%` }}></div></div></div>}
    </div>
);


const FolderCard: React.FC<{ folder: ProjectFolder; isExpanded: boolean; onExpandToggle: (id: string) => void; onDelete: (id: string) => void; onManuscriptDelete: (id: string) => void; onDrop: (files: File[]) => void; onViewReport: (m: ManuscriptFile) => void; onViewLogs: (m: ManuscriptFile) => void; onDownloadLog: (m: ManuscriptFile) => void; }> = ({ folder, isExpanded, onExpandToggle, onDelete, onManuscriptDelete, onDrop, onViewReport, onViewLogs, onDownloadLog }) => {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });
    return (
         <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md transition-all duration-300">
            <button onClick={() => onExpandToggle(folder.id)} className="w-full p-4 flex justify-between items-center text-left hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <div className="flex items-center gap-3"><FolderIcon className="h-6 w-6 text-teal-500" /><p className="font-bold text-lg text-slate-800 dark:text-slate-100">{folder.name}</p></div>
                <div className="flex items-center space-x-2"><button onClick={(e) => { e.stopPropagation(); onDelete(folder.id)}} className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon className="h-5 w-5"/></button><ChevronDownIcon className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/></div>
            </button>
            {isExpanded && <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <div className="space-y-2">{folder.manuscripts.map(m => <ManuscriptRow key={m.id} manuscript={m} onViewReport={onViewReport} onViewLogs={onViewLogs} onManuscriptDelete={onManuscriptDelete} onDownloadLog={onDownloadLog} />)}</div>
                <div {...getRootProps()} className="mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors">
                    <input {...getInputProps()} />
                    <UploadIcon className="h-8 w-8 mx-auto" />
                    <p className="mt-2 text-sm">Upload Manuscripts for Analysis</p>
                    <div className="mt-2 flex items-center justify-center text-xs text-slate-500">
                        <ShieldCheckIcon className="h-4 w-4 mr-1.5 text-green-500"/>
                        <span>Your files are processed securely.</span>
                    </div>
                </div>
            </div>}
        </div>
    );
};

export default ManuscriptAnalyzer;