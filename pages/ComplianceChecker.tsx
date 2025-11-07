import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppContext } from '../hooks/useAppContext';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import {
    ChevronLeftIcon, DownloadIcon, CheckIcon, XIcon, ExclamationIcon, ChevronDownIcon,
    TrashIcon, FolderIcon, PlusCircleIcon, UploadIcon, ClipboardListIcon
} from '../components/icons/Icons';
import * as pdfjsLib from 'pdfjs-dist';
import { performComplianceCheck } from '../services/geminiService';
import {
    ComplianceFinding, FindingStatus, ComplianceProfile, RuleFile,
    ProjectFolder, ManuscriptFile, ManuscriptStatus
} from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

// --- Helper & Utility Functions ---

const usePersistentState = <T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
    const [state, setState] = useState<T>(() => {
        try {
            const storedValue = localStorage.getItem(key);
            return storedValue ? JSON.parse(storedValue) : initialValue;
        } catch (error) {
            console.error(`Error reading localStorage key "${key}":`, error);
            return initialValue;
        }
    });

    useEffect(() => {
        try {
            // For complex states, strip transient data before saving (e.g., File objects)
            let valueToSave = state;
            if (key === 'compliance_folders' && Array.isArray(state)) {
                 valueToSave = state.map((folder: ProjectFolder) => ({
                    ...folder,
                    manuscripts: folder.manuscripts.map(({ file, ...rest }) => rest)
                })) as T;
            }
            localStorage.setItem(key, JSON.stringify(valueToSave));
        } catch (error) {
            console.error(`Error writing to localStorage key "${key}":`, error);
        }
    }, [key, state]);

    return [state, setState];
};

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

// --- UI Components ---

const renderStatusIcon = (status: FindingStatus) => {
    const styles = {
        pass: 'text-green-400 bg-green-900/50 border-green-500/50',
        warn: 'text-yellow-400 bg-yellow-900/50 border-yellow-500/50',
        fail: 'text-red-400 bg-red-900/50 border-red-500/50',
    };
    const icons = { pass: CheckIcon, warn: ExclamationIcon, fail: XIcon };
    const Icon = icons[status];
    return (
        <div className={`p-2 rounded-full border ${styles[status]}`}>
            <Icon className="h-6 w-6" />
        </div>
    );
};

const ManuscriptStatusIndicator: React.FC<{ status: ManuscriptStatus }> = ({ status }) => {
    const styles = {
        queued: 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
        processing: 'bg-blue-200 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse',
        completed: 'bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200',
        error: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
            {status}
        </span>
    );
};


// --- Main Compliance Checker Component ---

const ComplianceChecker: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser, addUsageLog, addToast } = useAppContext();
    const [profiles, setProfiles] = usePersistentState<ComplianceProfile[]>('compliance_profiles', []);
    const [ruleFiles, setRuleFiles] = usePersistentState<Record<string, RuleFile>>('compliance_rule_files', {});
    const [folders, setFolders] = usePersistentState<ProjectFolder[]>('compliance_folders', []);
    
    // Transient state (not persisted)
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    const transientFiles = useRef<Map<string, File>>(new Map());

    // Modal states
    const [modal, setModal] = useState<'createProfile' | 'createFolder' | 'viewReport' | 'viewLogs' | null>(null);
    const [selectedManuscript, setSelectedManuscript] = useState<ManuscriptFile | null>(null);
    const [newProfileName, setNewProfileName] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [selectedProfileForFolder, setSelectedProfileForFolder] = useState<string | null>(null);

    const addComplianceLog = (manuscriptId: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        setFolders(prev => prev.map(f => ({
            ...f,
            manuscripts: f.manuscripts.map(m => m.id === manuscriptId ? { ...m, logs: [...(m.logs || []), formattedMessage] } : m)
        })));
        if (selectedManuscript?.id === manuscriptId) {
            setSelectedManuscript(prev => prev ? { ...prev, logs: [...(prev.logs || []), formattedMessage] } : null);
        }
    };

    // File Dropzones Callbacks
    const onRulesDrop = useCallback(async (acceptedFiles: File[], profileId: string) => {
        addToast({type: 'info', message: `Processing ${acceptedFiles.length} rule file(s)...`});
        const newRuleFileEntries = await Promise.all(
            acceptedFiles.map(async (file) => {
                const id = Math.random().toString(36).substring(2, 9);
                const fileBuffer = await file.arrayBuffer();
                // FIX: Pass the file buffer as an object with a 'data' property to pdfjsLib.getDocument.
                const pdf = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
                const textContent = await extractTextFromPdf(pdf);
                return { id, file: { id, name: file.name, textContent } };
            })
        );
        setRuleFiles(prev => ({ ...prev, ...Object.fromEntries(newRuleFileEntries.map(e => [e.id, e.file])) }));
        setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, ruleFileIds: [...p.ruleFileIds, ...newRuleFileEntries.map(e => e.id)] } : p));
        addToast({type: 'success', message: `Added ${acceptedFiles.length} rule file(s).`});
    }, [addToast, setRuleFiles, setProfiles]);

    const onManuscriptsDrop = useCallback((acceptedFiles: File[], folderId: string) => {
        const newManuscripts: ManuscriptFile[] = acceptedFiles.map(file => {
            const id = Math.random().toString(36).substring(2, 9);
            transientFiles.current.set(id, file); // Store file object in ref
            return { id, name: file.name, status: 'queued', logs: [] };
        });
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, manuscripts: [...f.manuscripts, ...newManuscripts] } : f));
        setProcessingQueue(prev => [...prev, ...newManuscripts.map(m => m.id)]);
        addToast({type: 'info', message: `${newManuscripts.length} manuscript(s) added to queue.`});
    }, [addToast, setFolders]);
    
    // Profile Management
    const handleCreateProfile = () => {
        if (!newProfileName.trim()) { addToast({ type: 'error', message: "Profile name cannot be empty." }); return; }
        setProfiles(prev => [...prev, { id: Math.random().toString(36).substring(2, 9), name: newProfileName, ruleFileIds: [] }]);
        setNewProfileName('');
        setModal(null);
    };

    const handleDeleteProfile = (profileId: string) => {
        setProfiles(prev => prev.filter(p => p.id !== profileId));
        setFolders(prev => prev.map(f => f.profileId === profileId ? {...f, profileId: null} : f));
    };

    // Folder Management
    const handleCreateFolder = () => {
        if (!newFolderName.trim()) { addToast({ type: 'error', message: "Folder name cannot be empty." }); return; }
        setFolders(prev => [...prev, { id: Math.random().toString(36).substring(2, 9), name: newFolderName, profileId: selectedProfileForFolder, manuscripts: [] }]);
        setNewFolderName('');
        setSelectedProfileForFolder(null);
        setModal(null);
    };

    const handleDeleteFolder = (folderId: string) => setFolders(prev => prev.filter(f => f.id !== folderId));
    
    // Processing Queue Logic
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
            
            const updateManuscript = (status: ManuscriptStatus, data: Partial<ManuscriptFile>) => {
                setFolders(prev => prev.map(f => f.id === folder?.id ? {
                    ...f, manuscripts: f.manuscripts.map(m => m.id === manuscriptId ? { ...m, status, ...data } : m)
                } : f));
            };
            
            if (!manuscript || !folder || !folder.profileId || !fileObject) {
                addComplianceLog(manuscriptId, "ERROR: Manuscript, folder config, or file content not found.");
                updateManuscript('error', {});
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }
            const profile = profiles.find(p => p.id === folder.profileId);
            if (!profile || profile.ruleFileIds.length === 0) {
                 addComplianceLog(manuscriptId, `ERROR: Profile '${profile?.name || 'Unknown'}' not found or has no rule files.`);
                updateManuscript('error', { });
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }
            
            updateManuscript('processing', {});
            addComplianceLog(manuscriptId, "Processing started.");
            try {
                addComplianceLog(manuscriptId, "Extracting text from manuscript PDF...");
                // FIX: Pass the file buffer as an object with a 'data' property to pdfjsLib.getDocument.
                const manuscriptDoc = await pdfjsLib.getDocument({ data: await fileObject.arrayBuffer() }).promise;
                const manuscriptText = await extractTextFromPdf(manuscriptDoc);
                addComplianceLog(manuscriptId, `Manuscript text extracted (${manuscriptText.length} chars).`);

                addComplianceLog(manuscriptId, "Combining rule documents...");
                const rulesText = profile.ruleFileIds.map(id => ruleFiles[id]?.textContent).filter(Boolean).join('\n\n---\n\n');
                if (!rulesText.trim()) throw new Error('No rule documents found or they are empty.');
                addComplianceLog(manuscriptId, `Combined rules text (${rulesText.length} chars). Calling Gemini API...`);

                const report = await performComplianceCheck(manuscriptText, rulesText);
                addComplianceLog(manuscriptId, `API call successful. Found ${report.length} compliance items.`);
                addUsageLog({ userId: currentUser!.id, toolName: 'Compliance Checker' });
                updateManuscript('completed', { report });
            } catch (error) {
                const message = error instanceof Error ? error.message : "An unknown error occurred.";
                addComplianceLog(manuscriptId, `FATAL ERROR: ${message}`);
                updateManuscript('error', {});
            } finally {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Delay between jobs
                setIsProcessing(false);
                setProcessingQueue(q => q.slice(1));
            }
        };
        processNextInQueue();
    }, [processingQueue, isProcessing, folders, profiles, ruleFiles, addUsageLog, currentUser, setFolders]);

    // UI Actions
    const handleDownloadLog = (manuscript: ManuscriptFile) => {
        let content = `COMPLIANCE LOG\nFile: ${manuscript.name}\nStatus: ${manuscript.status}\n\n`;
        content += `PROCESS LOG:\n${(manuscript.logs || []).join('\n')}\n\n---\n\nCOMPLIANCE REPORT:\n\n`;
        if(manuscript.report && manuscript.report.length > 0) {
            manuscript.report.forEach(finding => {
                content += `[${finding.status.toUpperCase()}] ${finding.checkCategory}\n- Summary: ${finding.summary}\n- Manuscript (Page ${finding.manuscriptPage}): "${finding.manuscriptQuote}"\n- Rule (Page ${finding.rulePage}): "${finding.ruleContent}"\n- Recommendation: ${finding.recommendation}\n\n`;
            });
        } else {
            content += 'No compliance findings reported.\n';
        }
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
a.href = url;
        a.download = `${manuscript.name}.log.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="animate-fade-in h-full flex flex-col p-4 md:p-6 lg:p-8 bg-gray-100 dark:bg-gray-900">
            <div className="flex items-center mb-6 flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Compliance Checker Dashboard</h2>
            </div>
            
            <div className="flex-grow overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Profiles Section */}
                <section className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">Compliance Profiles</h3>
                        <button onClick={() => setModal('createProfile')} className="flex items-center px-3 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 shadow"><PlusCircleIcon className="h-5 w-5 mr-2"/>Create Profile</button>
                    </div>
                    {profiles.map(p => <ProfileCard key={p.id} profile={p} ruleFiles={ruleFiles} onExpandToggle={(id) => setExpandedSections(prev => ({...prev, [id]: !prev[id]}))} isExpanded={!!expandedSections[p.id]} onDelete={handleDeleteProfile} onRuleDelete={(ruleId) => setProfiles(prev => prev.map(prof => prof.id === p.id ? {...prof, ruleFileIds: prof.ruleFileIds.filter(id => id !== ruleId)} : prof))} onDrop={(files) => onRulesDrop(files, p.id)} />)}
                </section>

                {/* Folders Section */}
                <section className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h3 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-500">Project Folders</h3>
                        <button onClick={() => { setSelectedProfileForFolder(profiles[0]?.id || null); setModal('createFolder')}} className="flex items-center px-3 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 shadow"><FolderIcon className="h-5 w-5 mr-2"/>Create Folder</button>
                    </div>
                    {folders.map(f => <FolderCard key={f.id} folder={f} profiles={profiles} onExpandToggle={(id) => setExpandedSections(prev => ({...prev, [id]: !prev[id]}))} isExpanded={!!expandedSections[f.id]} onDelete={handleDeleteFolder} onMapProfile={(profId) => setFolders(prev => prev.map(fold => fold.id === f.id ? {...fold, profileId: profId} : fold))} onManuscriptDelete={(manId) => setFolders(prev => prev.map(fold => fold.id === f.id ? {...fold, manuscripts: fold.manuscripts.filter(m => m.id !== manId)} : fold))} onDrop={(files) => onManuscriptsDrop(files, f.id)} onViewReport={(man) => {setSelectedManuscript(man); setModal('viewReport');}} onViewLogs={(man) => {setSelectedManuscript(man); setModal('viewLogs');}}/>)}
                </section>
            </div>

            {/* Modals */}
            <Modal isOpen={modal === 'createProfile'} onClose={() => setModal(null)} title="Create New Profile">
                <form onSubmit={(e) => { e.preventDefault(); handleCreateProfile(); }} className="space-y-4">
                    <input type="text" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="E.g., Journal of Clinical Studies" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <div className="flex justify-end mt-4 space-x-2">
                        <button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded">Create</button>
                    </div>
                </form>
            </Modal>
            <Modal isOpen={modal === 'createFolder'} onClose={() => setModal(null)} title="Create New Folder">
                 <form onSubmit={(e) => { e.preventDefault(); handleCreateFolder(); }} className="space-y-4">
                    <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="E.g., October Submissions" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <select value={selectedProfileForFolder || ''} onChange={e => setSelectedProfileForFolder(e.target.value || null)} className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600">
                        <option value="">No Profile Mapped</option>
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex justify-end mt-4 space-x-2">
                        <button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-purple-500 text-white rounded">Create</button>
                    </div>
                </form>
            </Modal>
            <Modal isOpen={modal === 'viewReport' && !!selectedManuscript} onClose={() => setModal(null)} title={`Report: ${selectedManuscript?.name}`}>
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    {selectedManuscript?.report?.length === 0 && <p className="text-center text-gray-500">No compliance issues found.</p>}
                    {selectedManuscript?.report?.map((finding, index) => (
                        <div key={index} className="bg-gray-900 rounded-lg p-4">
                           <div className="flex items-start justify-between gap-4">
                                <h4 className="font-semibold text-lg mb-2 text-gray-200 flex-1">{finding.checkCategory}</h4>
                                {renderStatusIcon(finding.status)}
                           </div>
                           <p className="text-sm text-gray-400 italic mb-4">"{finding.summary}"</p>
                           <div className="space-y-3 text-sm">
                                <p><strong className="font-medium text-cyan-400">Recommendation:</strong> <span className="text-gray-300">{finding.recommendation}</span></p>
                                <p><strong className="font-medium text-cyan-400">Manuscript (p. {finding.manuscriptPage}):</strong> <span className="text-gray-300 italic">"{finding.manuscriptQuote}"</span></p>
                                <p><strong className="font-medium text-cyan-400">Rule (p. {finding.rulePage}):</strong> <span className="text-gray-300 italic">"{finding.ruleContent}"</span></p>
                           </div>
                        </div>
                    ))}
                    <div className="text-center pt-2">
                        <button onClick={() => selectedManuscript && handleDownloadLog(selectedManuscript)} className="text-sm text-gray-400 hover:underline">Download Full Log</button>
                    </div>
                </div>
            </Modal>
             <Modal isOpen={modal === 'viewLogs' && !!selectedManuscript} onClose={() => setModal(null)} title={`Logs: ${selectedManuscript?.name}`}>
                <div className="bg-gray-900 text-white font-mono text-xs rounded-md p-4 max-h-96 overflow-y-auto">
                    {(selectedManuscript?.logs || []).length > 0 ? selectedManuscript?.logs?.map((log, index) => <p key={index}>{log}</p>) : <p>No logs available.</p>}
                </div>
            </Modal>
        </div>
    );
};

// --- Sub-components for Cleaner JSX ---

const ProfileCard = ({ profile, ruleFiles, isExpanded, onExpandToggle, onDelete, onRuleDelete, onDrop }: { profile: ComplianceProfile, ruleFiles: Record<string, RuleFile>, isExpanded: boolean, onExpandToggle: (id: string) => void, onDelete: (id: string) => void, onRuleDelete: (ruleId: string) => void, onDrop: (files: File[]) => void }) => {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden transition-all duration-300">
            <div className="p-4 flex justify-between items-center">
                <div>
                    <p className="font-bold text-lg text-gray-800 dark:text-gray-100">{profile.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{profile.ruleFileIds.length} rule file(s)</p>
                </div>
                <div className="space-x-2">
                    <button onClick={() => onExpandToggle(profile.id)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronDownIcon className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/></button>
                    <button onClick={() => onDelete(profile.id)} className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon className="h-5 w-5"/></button>
                </div>
            </div>
            {isExpanded && <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                {profile.ruleFileIds.map(id => (
                    <div key={id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
                        <p className="text-sm truncate">{ruleFiles[id]?.name}</p>
                        <button onClick={() => onRuleDelete(id)} className="text-gray-400 hover:text-red-500 flex-shrink-0 ml-2"><XIcon className="h-4 w-4"/></button>
                    </div>
                ))}
                <div {...getRootProps()} className="mt-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-primary-500 transition-colors">
                    <input {...getInputProps()} />
                    <UploadIcon className="h-8 w-8 mx-auto text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">Add Rule Document(s)</p>
                    <p className="text-xs text-gray-500">Drag & drop PDF files here</p>
                </div>
            </div>}
        </div>
    );
};

const FolderCard = ({ folder, profiles, isExpanded, onExpandToggle, onDelete, onMapProfile, onManuscriptDelete, onDrop, onViewReport, onViewLogs }: any) => {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] } });
    return (
         <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden transition-all duration-300">
            <div className="p-4 flex justify-between items-center">
                <div>
                    <p className="font-bold text-lg text-gray-800 dark:text-gray-100">{folder.name}</p>
                     <select value={folder.profileId || ''} onChange={e => onMapProfile(e.target.value || null)} className="mt-1 text-sm bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md p-1 focus:ring-purple-500 focus:border-purple-500">
                        <option value="">-- Map a Profile --</option>
                        {profiles.map((p: ComplianceProfile) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                </div>
                <div className="space-x-2">
                    <button onClick={() => onExpandToggle(folder.id)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronDownIcon className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/></button>
                    <button onClick={() => onDelete(folder.id)} className="p-2 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon className="h-5 w-5"/></button>
                </div>
            </div>
            {isExpanded && <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="space-y-2">
                    {folder.manuscripts.map((m: ManuscriptFile) => (
                        <div key={m.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 p-2 rounded-md">
                            <p className="text-sm truncate flex-1">{m.name}</p>
                            <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
                                <ManuscriptStatusIndicator status={m.status} />
                                {m.status === 'completed' && <button onClick={() => onViewReport(m)} className="text-xs text-primary-500 hover:underline">Report</button>}
                                <button onClick={() => onViewLogs(m)} className="text-gray-400 hover:text-gray-200" title="View Logs"><ClipboardListIcon className="h-4 w-4"/></button>
                                <button onClick={() => onManuscriptDelete(m.id)} className="text-gray-400 hover:text-red-500"><XIcon className="h-4 w-4"/></button>
                            </div>
                        </div>
                    ))}
                </div>
                <div {...getRootProps()} className="mt-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 transition-colors">
                    <input {...getInputProps()} />
                    <UploadIcon className="h-8 w-8 mx-auto text-gray-400" />
                    <p className="mt-2 text-sm">Upload Manuscripts</p>
                    <p className="text-xs text-gray-500">Drag & drop PDF files here</p>
                </div>
            </div>}
        </div>
    );
};

export default ComplianceChecker;