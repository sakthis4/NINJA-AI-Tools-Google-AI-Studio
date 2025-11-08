
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppContext } from '../hooks/useAppContext';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import {
    ChevronLeftIcon, DownloadIcon, CheckIcon, XIcon, ExclamationIcon, ChevronDownIcon,
    TrashIcon, FolderIcon, PlusCircleIcon, UploadIcon, ClipboardListIcon, ShieldCheckIcon
} from '../components/icons/Icons';
import * as pdfjsLib from 'pdfjs-dist';
import { performComplianceCheck } from '../services/geminiService';
import {
    ComplianceFinding, FindingStatus, ComplianceProfile, RuleFile,
    ProjectFolder, ManuscriptFile, ManuscriptStatus
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

const renderStatusIcon = (status: FindingStatus) => {
    const styles = { pass: 'text-green-400 bg-green-900/50 border-green-500/50', warn: 'text-yellow-400 bg-yellow-900/50 border-yellow-500/50', fail: 'text-red-400 bg-red-900/50 border-red-500/50' };
    const Icon = { pass: CheckIcon, warn: ExclamationIcon, fail: XIcon }[status];
    return <div className={`p-2 rounded-full border ${styles[status]}`}><Icon className="h-6 w-6" /></div>;
};

const ManuscriptStatusIndicator: React.FC<{ status: ManuscriptStatus }> = ({ status }) => {
    const styles = { queued: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200', processing: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200', completed: 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200', error: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200' };
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>{status}</span>;
};

const ComplianceChecker: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser, addUsageLog, setStatusBarMessage, currentUserData, createComplianceProfile, deleteComplianceProfile, addRuleFilesToProfile, deleteRuleFileFromProfile, createComplianceFolder, deleteComplianceFolder, updateComplianceFolderProfile, addManuscriptsToFolder, updateManuscript, deleteManuscript } = useAppContext();
    const profiles = currentUserData?.complianceProfiles || [];
    const ruleFiles = currentUserData?.ruleFiles || {};
    const folders = currentUserData?.complianceFolders || [];
    
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    const transientFiles = useRef<Map<string, File>>(new Map());

    const [modal, setModal] = useState<'createProfile' | 'createFolder' | 'viewReport' | 'viewLogs' | null>(null);
    const [selectedManuscript, setSelectedManuscript] = useState<ManuscriptFile | null>(null);
    const [newProfileName, setNewProfileName] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [selectedProfileForFolder, setSelectedProfileForFolder] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-pro');

    const addComplianceLog = useCallback((manuscriptId: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        const manuscript = folders.flatMap(f => f.manuscripts).find(m => m.id === manuscriptId);
        if (manuscript) {
            updateManuscript(manuscriptId, { logs: [...(manuscript.logs || []), formattedMessage] });
        }
    }, [folders, updateManuscript]);

    const onRulesDrop = useCallback(async (acceptedFiles: File[], profileId: string) => {
        setStatusBarMessage(`Processing ${acceptedFiles.length} rule file(s)...`, 'info');
        const newRuleFileEntries = await Promise.all(acceptedFiles.map(async (file) => {
            const id = Math.random().toString(36).substring(2, 9);
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
            return [id, { id, name: file.name, textContent: await extractTextFromPdf(pdf) }];
        }));
        addRuleFilesToProfile(profileId, Object.fromEntries(newRuleFileEntries));
        setStatusBarMessage(`Added ${acceptedFiles.length} rule file(s).`, 'success');
    }, [setStatusBarMessage, addRuleFilesToProfile]);

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
            const findResult = folders.reduce<{ folder?: ProjectFolder, manuscript?: ManuscriptFile }>((acc, f) => {
                const m = f.manuscripts.find(ms => ms.id === manuscriptId);
                if (m) { acc.folder = f; acc.manuscript = m; }
                return acc;
            }, {});
            const { folder, manuscript } = findResult;
            const fileObject = transientFiles.current.get(manuscriptId);
            
            if (!manuscript || !folder || !folder.profileId || !fileObject) {
                addComplianceLog(manuscriptId, "ERROR: Config or file content not found.");
                updateManuscript(manuscriptId, { status: 'error' });
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }
            const profile = profiles.find(p => p.id === folder.profileId);
            if (!profile || profile.ruleFileIds.length === 0) {
                addComplianceLog(manuscriptId, `ERROR: Profile '${profile?.name || 'Unknown'}' empty.`);
                updateManuscript(manuscriptId, { status: 'error' });
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }
            
            updateManuscript(manuscriptId, { status: 'processing', progress: 0 });
            addComplianceLog(manuscriptId, "Processing started.");
            try {
                addComplianceLog(manuscriptId, "Extracting text from manuscript...");
                const manuscriptDoc = await pdfjsLib.getDocument({ data: new Uint8Array(await fileObject.arrayBuffer()) }).promise;
                const manuscriptText = await extractTextFromPdf(manuscriptDoc);
                
                const CHUNK_SIZE_PAGES = 25;
                const pageChunks = manuscriptText.split(/(?=\[Page \d+\])/g);
                const textChunks = pageChunks.reduce((acc, chunk, i) => (i % CHUNK_SIZE_PAGES ? acc[acc.length - 1] += chunk : acc.push(chunk), acc), [] as string[]);
                addComplianceLog(manuscriptId, `Split into ${textChunks.length} chunks.`);

                const rulesText = profile.ruleFileIds.map(id => ruleFiles[id]?.textContent).filter(Boolean).join('\n\n---\n\n');
                if (!rulesText.trim()) throw new Error('No rule documents found or they are empty.');

                let allFindings: ComplianceFinding[] = [];
                for (const [index, chunk] of textChunks.entries()) {
                    updateManuscript(manuscriptId, { progress: Math.round(((index + 1) / textChunks.length) * 100) });
                    addComplianceLog(manuscriptId, `Processing chunk ${index + 1}/${textChunks.length}...`);
                    try {
                        const reportForChunk = await performComplianceCheck(chunk, rulesText, selectedModel);
                        if (reportForChunk.length > 0) {
                            addComplianceLog(manuscriptId, `Found ${reportForChunk.length} potential issues in chunk ${index + 1}.`);
                            allFindings.push(...reportForChunk);
                        }
                    } catch (chunkError) { addComplianceLog(manuscriptId, `ERROR processing chunk ${index + 1}: ${chunkError instanceof Error ? chunkError.message : "Unknown"}`); }
                    // FIX: The promise resolver expects one argument. Passing 'undefined' to satisfy type checking.
                    if (index < textChunks.length - 1) await new Promise<void>(resolve => setTimeout(() => resolve(undefined), 1500));
                }

                addComplianceLog(manuscriptId, `API calls successful. Found ${allFindings.length} items.`);
                addUsageLog({ userId: currentUser!.id, toolName: 'Compliance Checker', modelName: selectedModel });
                updateManuscript(manuscriptId, { status: 'completed', report: allFindings, progress: 100 });
            } catch (error) {
                addComplianceLog(manuscriptId, `FATAL ERROR: ${error instanceof Error ? error.message : "Unknown"}`);
                updateManuscript(manuscriptId, { status: 'error' });
            } finally {
                setIsProcessing(false);
                setProcessingQueue(q => q.slice(1));
            }
        };
        processNextInQueue();
    }, [processingQueue, isProcessing, folders, profiles, ruleFiles, addUsageLog, currentUser, addComplianceLog, updateManuscript, selectedModel]);

    const handleDownloadLog = (manuscript: ManuscriptFile) => {
        const fileName = `${manuscript.name}.log.txt`;
        let content = `COMPLIANCE LOG\nFile: ${manuscript.name}\nStatus: ${manuscript.status}\n\nPROCESS LOG:\n${(manuscript.logs || []).join('\n')}\n\n---\n\nCOMPLIANCE REPORT:\n\n`;
        (manuscript.report || []).forEach(f => {
            content += `[${f.status.toUpperCase()}] ${f.checkCategory}\n- Summary: ${f.summary}\n- Manuscript (p. ${f.manuscriptPage}): "${f.manuscriptQuote}"\n- Rule (p. ${f.rulePage}): "${f.ruleContent}"\n- Recommendation: ${f.recommendation}\n\n`;
        });
        
        // Trigger download
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

    return (
        <div className="animate-fade-in h-full flex flex-col p-4 md:p-6 lg:p-8 bg-gray-100 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Compliance Checker</h2>
                </div>
                {currentUser?.canUseProModel && (
                     <div className="flex items-center gap-2">
                         <label className="text-sm font-medium">Model:</label>
                         <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md p-1.5 focus:ring-purple-500 focus:border-purple-500">
                             <option value="gemini-2.5-flash">Flash (Fast)</option>
                             <option value="gemini-2.5-pro">Pro (Advanced)</option>
                         </select>
                     </div>
                 )}
            </div>
            
            <div className="flex-grow overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">Compliance Profiles</h3>
                        <button onClick={() => setModal('createProfile')} className="flex items-center px-3 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 shadow"><PlusCircleIcon className="h-5 w-5 mr-2"/>Create Profile</button>
                    </div>
                    {profiles.map(p => <ProfileCard key={p.id} profile={p} ruleFiles={ruleFiles} onExpandToggle={(id) => setExpandedSections(prev => ({...prev, [id]: !prev[id]}))} isExpanded={!!expandedSections[p.id]} onDelete={deleteComplianceProfile} onRuleDelete={(ruleId) => deleteRuleFileFromProfile(p.id, ruleId)} onDrop={(files) => onRulesDrop(files, p.id)} />)}
                </section>
                <section className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-500">Project Folders</h3>
                        <button onClick={() => { setSelectedProfileForFolder(profiles[0]?.id || null); setModal('createFolder')}} className="flex items-center px-3 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 shadow"><FolderIcon className="h-5 w-5 mr-2"/>Create Folder</button>
                    </div>
                    {folders.map(f => <FolderCard key={f.id} folder={f} profiles={profiles} onExpandToggle={(id) => setExpandedSections(prev => ({...prev, [id]: !prev[id]}))} isExpanded={!!expandedSections[f.id]} onDelete={deleteComplianceFolder} onMapProfile={(profId) => updateComplianceFolderProfile(f.id, profId)} onManuscriptDelete={(manId) => deleteManuscript(f.id, manId)} onDrop={(files) => onManuscriptsDrop(files, f.id)} onViewReport={(man) => {setSelectedManuscript(man); setModal('viewReport');}} onViewLogs={(man) => {setSelectedManuscript(man); setModal('viewLogs');}}/>)}
                </section>
            </div>

            <Modal isOpen={modal === 'createProfile'} onClose={() => setModal(null)} title="Create New Profile">
                <form onSubmit={(e) => { e.preventDefault(); if (newProfileName.trim()) { createComplianceProfile(newProfileName.trim()); setNewProfileName(''); setModal(null); } }} className="space-y-4">
                    <input type="text" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="E.g., Journal of Clinical Studies" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <div className="flex justify-end mt-4 space-x-2"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded">Cancel</button><button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded">Create</button></div>
                </form>
            </Modal>
            <Modal isOpen={modal === 'createFolder'} onClose={() => setModal(null)} title="Create New Folder">
                 <form onSubmit={(e) => { e.preventDefault(); if(newFolderName.trim()) { createComplianceFolder(newFolderName.trim(), selectedProfileForFolder); setNewFolderName(''); setSelectedProfileForFolder(null); setModal(null); } }} className="space-y-4">
                    <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="E.g., October Submissions" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <select value={selectedProfileForFolder || ''} onChange={e => setSelectedProfileForFolder(e.target.value || null)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                        <option value="">No Profile Mapped</option>
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex justify-end mt-4 space-x-2"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded">Cancel</button><button type="submit" className="px-4 py-2 bg-purple-500 text-white rounded">Create</button></div>
                </form>
            </Modal>
            <Modal isOpen={modal === 'viewReport' && !!selectedManuscript} onClose={() => setModal(null)} title={`Report: ${selectedManuscript?.name}`}>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    {selectedManuscript?.report?.length === 0 && <p className="text-center text-gray-500">No compliance issues found.</p>}
                    {selectedManuscript?.report?.map((finding, index) => (
                        <div key={index} className="bg-gray-900 rounded-lg p-4">
                           <div className="flex items-start justify-between gap-4">
                                <h4 className="font-semibold text-lg mb-2 text-gray-200 flex-1">{finding.checkCategory}</h4>{renderStatusIcon(finding.status)}
                           </div>
                           <p className="text-sm text-gray-400 italic mb-4">"{finding.summary}"</p>
                           <div className="space-y-3 text-sm">
                                <p><strong className="font-medium text-cyan-400">Recommendation:</strong> <span className="text-gray-300">{finding.recommendation}</span></p>
                                <p><strong className="font-medium text-cyan-400">Manuscript (p. {finding.manuscriptPage}):</strong> <span className="text-gray-300 italic">"{finding.manuscriptQuote}"</span></p>
                                <p><strong className="font-medium text-cyan-400">Rule (p. {finding.rulePage}):</strong> <span className="text-gray-300 italic">"{finding.ruleContent}"</span></p>
                           </div>
                        </div>
                    ))}
                    <div className="text-center pt-2"><button onClick={() => selectedManuscript && handleDownloadLog(selectedManuscript)} className="text-sm text-gray-400 hover:underline">Download Full Log</button></div>
                </div>
            </Modal>
             <Modal isOpen={modal === 'viewLogs' && !!selectedManuscript} onClose={() => setModal(null)} title={`Logs: ${selectedManuscript?.name}`}>
                <div className="bg-gray-900 text-white font-mono text-xs rounded-md p-4 max-h-96 overflow-y-auto">
                    {(selectedManuscript?.logs || []).map((log, index) => <p key={index}>{log}</p>)}
                </div>
            </Modal>
        </div>
    );
};

const ProfileCard: React.FC<{ profile: ComplianceProfile; ruleFiles: Record<string, RuleFile>; isExpanded: boolean; onExpandToggle: (id: string) => void; onDelete: (id: string) => void; onRuleDelete: (ruleId: string) => void; onDrop: (files: File[]) => void; }> = ({ profile, ruleFiles, isExpanded, onExpandToggle, onDelete, onRuleDelete, onDrop }) => {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            <button onClick={() => onExpandToggle(profile.id)} className="w-full p-4 flex justify-between items-center text-left">
                <div><p className="font-bold text-lg">{profile.name}</p><p className="text-sm text-gray-500">{profile.ruleFileIds.length} rule file(s)</p></div>
                <div className="flex items-center space-x-2">
                    <button onClick={(e) => { e.stopPropagation(); onDelete(profile.id)}} className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon className="h-5 w-5"/></button>
                    <ChevronDownIcon className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/>
                </div>
            </button>
            {isExpanded && <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                {profile.ruleFileIds.map(id => (<div key={id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md"><p className="text-sm truncate">{ruleFiles[id]?.name}</p><button onClick={() => onRuleDelete(id)} className="text-gray-400 hover:text-red-500 ml-2"><XIcon className="h-4 w-4"/></button></div>))}
                <div {...getRootProps()} className="mt-2 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary-500">
                    <input {...getInputProps()} />
                    <UploadIcon className="h-8 w-8 mx-auto text-gray-400" />
                    <p className="mt-2 text-sm">Add Rule Document(s)</p>
                    <div className="mt-2 flex items-center justify-center text-xs text-gray-500">
                        <ShieldCheckIcon className="h-4 w-4 mr-1.5 text-green-500"/>
                        <span>Your files are processed securely.</span>
                    </div>
                </div>
            </div>}
        </div>
    );
};

const ManuscriptRow: React.FC<{ manuscript: ManuscriptFile; onViewReport: (m: ManuscriptFile) => void; onViewLogs: (m: ManuscriptFile) => void; onManuscriptDelete: (id: string) => void; }> = ({ manuscript, onViewReport, onViewLogs, onManuscriptDelete }) => (
    <div className="bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
        <div className="flex justify-between items-center">
            <p className="text-sm truncate flex-1">{manuscript.name}</p>
            <div className="flex items-center space-x-3 ml-4">
                <ManuscriptStatusIndicator status={manuscript.status} />
                {manuscript.status === 'completed' && <button onClick={() => onViewReport(manuscript)} className="text-xs text-primary-500 hover:underline">Report</button>}
                <button onClick={() => onViewLogs(manuscript)} title="View Logs"><ClipboardListIcon className="h-4 w-4"/></button>
                <button onClick={() => onManuscriptDelete(manuscript.id)}><XIcon className="h-4 w-4"/></button>
            </div>
        </div>
        {manuscript.status === 'processing' && <div className="mt-2"><div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-1.5"><div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${manuscript.progress || 0}%` }}></div></div></div>}
    </div>
);

const FolderCard: React.FC<{ folder: ProjectFolder; profiles: ComplianceProfile[]; isExpanded: boolean; onExpandToggle: (id: string) => void; onDelete: (id: string) => void; onMapProfile: (profId: string | null) => void; onManuscriptDelete: (id: string) => void; onDrop: (files: File[]) => void; onViewReport: (m: ManuscriptFile) => void; onViewLogs: (m: ManuscriptFile) => void; }> = ({ folder, profiles, isExpanded, onExpandToggle, onDelete, onMapProfile, onManuscriptDelete, onDrop, onViewReport, onViewLogs }) => {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });
    return (
         <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg">
            <button onClick={() => onExpandToggle(folder.id)} className="w-full p-4 flex justify-between items-center text-left">
                <div><p className="font-bold text-lg">{folder.name}</p><div className="mt-1" onClick={e => e.stopPropagation()}><select value={folder.profileId || ''} onChange={e => onMapProfile(e.target.value || null)} className="text-sm bg-gray-100 dark:bg-gray-700 border rounded p-1"><option value="">-- Map a Profile --</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
                <div className="flex items-center space-x-2"><button onClick={(e) => { e.stopPropagation(); onDelete(folder.id)}} className="p-2 rounded-full text-gray-400 hover:text-red-500"><TrashIcon className="h-5 w-5"/></button><ChevronDownIcon className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/></div>
            </button>
            {isExpanded && <div className="p-4 border-t">
                <div className="space-y-2">{folder.manuscripts.map(m => <ManuscriptRow key={m.id} manuscript={m} onViewReport={onViewReport} onViewLogs={onViewLogs} onManuscriptDelete={onManuscriptDelete} />)}</div>
                <div {...getRootProps()} className="mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-purple-500">
                    <input {...getInputProps()} />
                    <UploadIcon className="h-8 w-8 mx-auto text-gray-400" />
                    <p className="mt-2 text-sm">Upload Manuscripts</p>
                    <div className="mt-2 flex items-center justify-center text-xs text-gray-500">
                        <ShieldCheckIcon className="h-4 w-4 mr-1.5 text-green-500"/>
                        <span>Your files are processed securely.</span>
                    </div>
                </div>
            </div>}
        </div>
    );
};

export default ComplianceChecker;
