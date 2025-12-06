import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppContext } from '../hooks/useAppContext';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';
import {
    ChevronLeftIcon, DownloadIcon, CheckIcon, XIcon, ExclamationIcon, ChevronDownIcon,
    TrashIcon, FolderIcon, PlusCircleIcon, UploadIcon, ClipboardListIcon, ShieldCheckIcon, DocumentTextIcon, BookOpenIcon, InfoIcon
} from '../components/icons/Icons';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { analyzeManuscript, performComplianceCheck, scoreManuscript, analyzeJournalMetadata, simulatePeerReview } from '../services/aiService';
import {
    ComplianceFinding, FindingStatus, ComplianceProfile, RuleFile,
    ComplianceProjectFolder, ManuscriptFile, ManuscriptStatus, JournalRecommendation, ManuscriptIssuePriority, ManuscriptIssue, PeerReviewSimulation
} from '../types';
import ScoringDashboard from '../components/ScoringDashboard';

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
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        const result = await mammoth.extractRawText({ arrayBuffer });
        // Heuristic to simulate page numbers for Word documents
        const words = result.value.split(/\s+/);
        const wordsPerPage = 300; // An average page has about 300 words
        let fullText = '';
        let pageCounter = 1;
        for (let i = 0; i < words.length; i += wordsPerPage) {
            const chunk = words.slice(i, i + wordsPerPage).join(' ');
            if (chunk.trim()) {
                fullText += `[Page ${pageCounter}]\n${chunk}\n\n`;
                pageCounter++;
            }
        }
        return fullText;
    } else {
        throw new Error(`Unsupported file type: ${file.name}. Please upload a PDF or DOCX file.`);
    }
}

const renderStatusIcon = (status: FindingStatus) => {
    const styles = { pass: 'text-green-400 bg-green-900/50 border-green-500/50', warn: 'text-yellow-400 bg-yellow-900/50 border-yellow-500/50', fail: 'text-red-400 bg-red-900/50 border-red-500/50' };
    const Icon = { pass: CheckIcon, warn: ExclamationIcon, fail: XIcon }[status];
    return <div className={`p-2 rounded-full border ${styles[status]}`}><Icon className="h-6 w-6" /></div>;
};

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

const JournalComplianceChecker: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { currentUser, addUsageLog, setStatusBarMessage, currentUserData, createJournalComplianceProfile, deleteComplianceProfile, addRuleFilesToProfile, deleteRuleFileFromProfile, createJournalComplianceFolder, deleteJournalComplianceFolder, updateJournalComplianceFolderProfile, addManuscriptsToJournalComplianceFolder, updateJournalComplianceManuscript, deleteJournalComplianceManuscript } = useAppContext();
    const allProfiles = currentUserData?.complianceProfiles || [];
    const profiles = useMemo(() => allProfiles.filter(p => p.type === 'journal'), [allProfiles]);
    const ruleFiles = currentUserData?.ruleFiles || {};
    const folders = currentUserData?.journalComplianceFolders || [];
    
    const [activeTab, setActiveTab] = useState<'profiles' | 'projects'>('projects');
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
    const transientFiles = useRef<Map<string, File>>(new Map());

    const [modal, setModal] = useState<'createProfile' | 'createFolder' | 'viewReport' | 'viewLogs' | null>(null);
    const [selectedManuscript, setSelectedManuscript] = useState<ManuscriptFile | null>(null);
    const [newProfileName, setNewProfileName] = useState('');
    const [newFolderName, setNewFolderName] = useState('');
    const [selectedProfileForFolder, setSelectedProfileForFolder] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState(currentUser?.canUseProModel ? 'gemini-3-pro-preview' : 'gemini-2.5-flash');
    const [reportTab, setReportTab] = useState<'compliance' | 'analysis' | 'recommendations' | 'scoring' | 'metadata' | 'peerReview'>('compliance');
    
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(true);

    const addComplianceLog = useCallback((manuscriptId: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        const manuscript = folders.flatMap(f => f.manuscripts).find(m => m.id === manuscriptId);
        if (manuscript) {
            updateJournalComplianceManuscript(manuscriptId, { logs: [...(manuscript.logs || []), formattedMessage] });
        }
    }, [folders, updateJournalComplianceManuscript]);

    const onRulesDrop = useCallback(async (acceptedFiles: File[], profileId: string) => {
        setStatusBarMessage(`Processing ${acceptedFiles.length} rule file(s)...`, 'info');
        const newRuleFileEntries: Record<string, RuleFile> = {};
        for (const file of acceptedFiles) {
            try {
                const textContent = await extractTextFromFile(file);
                const id = Math.random().toString(36).substring(2, 9);
                newRuleFileEntries[id] = { id, name: file.name, textContent };
            } catch (error) {
                setStatusBarMessage(`Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            }
        }
        if (Object.keys(newRuleFileEntries).length > 0) {
            addRuleFilesToProfile(profileId, newRuleFileEntries);
            setStatusBarMessage(`Added ${Object.keys(newRuleFileEntries).length} rule file(s).`, 'success');
        }
    }, [setStatusBarMessage, addRuleFilesToProfile]);

    const onManuscriptsDrop = useCallback((acceptedFiles: File[], folderId: string) => {
        const newManuscripts: ManuscriptFile[] = acceptedFiles.map(file => {
            const id = Math.random().toString(36).substring(2, 9);
            transientFiles.current.set(id, file);
            return { id, name: file.name, status: 'queued', logs: [], progress: 0 };
        });
        addManuscriptsToJournalComplianceFolder(folderId, newManuscripts);
        setProcessingQueue(prev => [...prev, ...newManuscripts.map(m => m.id)]);
        setStatusBarMessage(`${newManuscripts.length} manuscript(s) added to queue.`, 'info');
    }, [setStatusBarMessage, addManuscriptsToJournalComplianceFolder]);

    useEffect(() => {
        const processNextInQueue = async () => {
            if (isProcessing || processingQueue.length === 0) return;
            setIsProcessing(true);
            const manuscriptId = processingQueue[0];
            const findResult = folders.reduce((acc, f) => {
                const m = f.manuscripts.find(ms => ms.id === manuscriptId);
                if (m) { acc.folder = f; acc.manuscript = m; }
                return acc;
            }, {} as { folder?: ComplianceProjectFolder, manuscript?: ManuscriptFile });
            const { folder, manuscript } = findResult;
            const fileObject = transientFiles.current.get(manuscriptId);
            
            if (!manuscript || !folder || !folder.profileId || !fileObject) {
                addComplianceLog(manuscriptId, "ERROR: Config or file content not found. A profile must be mapped to the folder.");
                updateJournalComplianceManuscript(manuscriptId, { status: 'error' });
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }
            const profile = profiles.find(p => p.id === folder.profileId);
            if (!profile || profile.ruleFileIds.length === 0) {
                addComplianceLog(manuscriptId, `ERROR: Profile '${profile?.name || 'Unknown'}' is empty.`);
                updateJournalComplianceManuscript(manuscriptId, { status: 'error' });
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }
            
            updateJournalComplianceManuscript(manuscriptId, { status: 'processing', progress: 0 });
            addComplianceLog(manuscriptId, "Processing started.");
            try {
                addComplianceLog(manuscriptId, "Extracting text from manuscript...");
                const manuscriptText = await extractTextFromFile(fileObject);
                
                const CHUNK_SIZE_PAGES = 25;
                const pageChunks = manuscriptText.split(/(?=\[Page \d+\])/g);
                const textChunks = pageChunks.reduce((acc, chunk, i) => (i % CHUNK_SIZE_PAGES ? acc[acc.length - 1] += chunk : acc.push(chunk), acc), [] as string[]);
                addComplianceLog(manuscriptId, `Split into ${textChunks.length} chunks.`);

                const rulesText = profile.ruleFileIds.map(id => ruleFiles[id]?.textContent).filter(Boolean).join('\n\n---\n\n');
                if (!rulesText.trim()) throw new Error('No rule documents found or they are empty.');

                const totalSteps = textChunks.length + 4; // Compliance chunks + analysis + scoring + metadata + peer review

                let allFindings: ComplianceFinding[] = [];
                let allRecommendations: JournalRecommendation[] = [];
                for (const [index, chunk] of textChunks.entries()) {
                    updateJournalComplianceManuscript(manuscriptId, { progress: Math.round(((index + 1) / totalSteps) * 100) });
                    addComplianceLog(manuscriptId, `Processing compliance chunk ${index + 1}/${textChunks.length}...`);
                    try {
                        const isFirstChunk = index === 0;
                        const { findings, recommendations } = await performComplianceCheck(chunk, rulesText, selectedModel, isFirstChunk);
                        if (findings.length > 0) {
                            addComplianceLog(manuscriptId, `Found ${findings.length} compliance issues in chunk ${index + 1}.`);
                            allFindings.push(...findings);
                        }
                        if (isFirstChunk && recommendations.length > 0) {
                            addComplianceLog(manuscriptId, `Received ${recommendations.length} journal recommendations.`);
                            allRecommendations.push(...recommendations);
                        }
                    } catch (chunkError) { addComplianceLog(manuscriptId, `ERROR processing compliance chunk ${index + 1}: ${chunkError instanceof Error ? chunkError.message : "Unknown"}`); }
                    if (index < textChunks.length - 1) await new Promise<void>(resolve => setTimeout(() => resolve(), 1500));
                }

                updateJournalComplianceManuscript(manuscriptId, { progress: Math.round((textChunks.length / totalSteps) * 100) });
                addComplianceLog(manuscriptId, `Compliance check finished. Found ${allFindings.length} items. Starting manuscript analysis...`);
                
                let analysisIssues: ManuscriptIssue[] = [];
                try {
                    analysisIssues = await analyzeManuscript(manuscriptText, selectedModel);
                    addComplianceLog(manuscriptId, `Manuscript analysis finished. Found ${analysisIssues.length} issues.`);
                } catch (analysisError) {
                    addComplianceLog(manuscriptId, `ERROR during manuscript analysis: ${analysisError instanceof Error ? analysisError.message : "Unknown"}`);
                }

                updateJournalComplianceManuscript(manuscriptId, { progress: Math.round(((textChunks.length + 1) / totalSteps) * 100) });
                addComplianceLog(manuscriptId, `Manuscript analysis finished. Starting scoring...`);
                
                let scores = null;
                try {
                    scores = await scoreManuscript(manuscriptText, selectedModel);
                    addComplianceLog(manuscriptId, `Manuscript scoring finished successfully.`);
                } catch (scoringError) {
                     addComplianceLog(manuscriptId, `ERROR during manuscript scoring: ${scoringError instanceof Error ? scoringError.message : "Unknown"}`);
                }

                updateJournalComplianceManuscript(manuscriptId, { progress: Math.round(((textChunks.length + 2) / totalSteps) * 100) });
                addComplianceLog(manuscriptId, `Scoring finished. Starting metadata analysis...`);

                let metadataReport = null;
                try {
                    metadataReport = await analyzeJournalMetadata(manuscriptText, selectedModel);
                    addComplianceLog(manuscriptId, `Metadata analysis finished.`);
                } catch (metaError) {
                    addComplianceLog(manuscriptId, `ERROR during metadata analysis: ${metaError instanceof Error ? metaError.message : "Unknown"}`);
                }

                updateJournalComplianceManuscript(manuscriptId, { progress: Math.round(((textChunks.length + 3) / totalSteps) * 100) });
                addComplianceLog(manuscriptId, `Metadata analysis finished. Starting peer review simulation...`);

                let peerReviewSimulation = null;
                try {
                    peerReviewSimulation = await simulatePeerReview(manuscriptText, selectedModel);
                    addComplianceLog(manuscriptId, `Peer review simulation finished.`);
                } catch (reviewError) {
                    addComplianceLog(manuscriptId, `ERROR during peer review simulation: ${reviewError instanceof Error ? reviewError.message : "Unknown"}`);
                }

                addUsageLog({ 
                    userId: currentUser!.id, 
                    toolName: 'Journal Compliance Checker', 
                    modelName: selectedModel,
                    outputId: manuscriptId,
                    outputName: fileObject.name,
                });
                updateJournalComplianceManuscript(manuscriptId, { 
                    status: 'completed', 
                    complianceReport: allFindings, 
                    journalRecommendations: allRecommendations, 
                    analysisReport: analysisIssues,
                    scores: scores || undefined,
                    metadataAnalysisReport: metadataReport || undefined,
                    peerReviewSimulation: peerReviewSimulation || undefined,
                    progress: 100 
                });
            } catch (error) {
                addComplianceLog(manuscriptId, `FATAL ERROR: ${error instanceof Error ? error.message : "Unknown"}`);
                updateJournalComplianceManuscript(manuscriptId, { status: 'error' });
            } finally {
                setIsProcessing(false);
                setProcessingQueue(q => q.slice(1));
            }
        };
        processNextInQueue();
    }, [processingQueue, isProcessing, folders, profiles, ruleFiles, addUsageLog, currentUser, addComplianceLog, updateJournalComplianceManuscript, selectedModel]);

    const handleDownloadReport = (manuscript: ManuscriptFile) => {
        const fileName = `${manuscript.name}_report.csv`;
        let csvContent = `File Name,${escapeCsvField(manuscript.name)}\nStatus,${escapeCsvField(manuscript.status)}\n\n`;

        if (manuscript.scores) {
            csvContent += '## SCORING REPORT ##\n';
            csvContent += 'Metric,Score,Reasoning\n';
            for (const [key, value] of Object.entries(manuscript.scores)) {
                const scoreName = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
                csvContent += [scoreName, value.score, value.reasoning].map(escapeCsvField).join(',') + '\n';
            }
            csvContent += '\n';
        }

        if (manuscript.peerReviewSimulation) {
            csvContent += '## PEER REVIEW SIMULATION ##\n';
            csvContent += `Summary,${escapeCsvField(manuscript.peerReviewSimulation.manuscriptSummary)}\n`;
            csvContent += `Suitability,${escapeCsvField(manuscript.peerReviewSimulation.suitabilityForPeerReview)}\n`;
            csvContent += `Strengths,"${manuscript.peerReviewSimulation.strengths.join('; ')}"\n`;
            csvContent += `Weaknesses,"${manuscript.peerReviewSimulation.weaknesses.join('; ')}"\n`;
            csvContent += `Reviewer Concerns,"${manuscript.peerReviewSimulation.reviewerConcerns.join('; ')}"\n`;
            csvContent += `Methodological Gaps,${escapeCsvField(manuscript.peerReviewSimulation.methodologicalGaps)}\n`;
            csvContent += `Reviewer Questions,"${manuscript.peerReviewSimulation.reviewerQuestions.join('; ')}"\n`;
            csvContent += '\n';
        }

        if (manuscript.complianceReport && manuscript.complianceReport.length > 0) {
            csvContent += '## COMPLIANCE REPORT ##\n';
            csvContent += 'Status,Category,Summary,Manuscript Quote,Manuscript Page,Rule Content,Rule Page,Recommendation\n';
            manuscript.complianceReport.forEach(f => {
                csvContent += [f.status, f.checkCategory, f.summary, f.manuscriptQuote, f.manuscriptPage, f.ruleContent, f.rulePage, f.recommendation].map(escapeCsvField).join(',') + '\n';
            });
            csvContent += '\n';
        }

        if (manuscript.analysisReport && manuscript.analysisReport.length > 0) {
            csvContent += '## MANUSCRIPT ANALYSIS REPORT ##\n';
            csvContent += 'Priority,Category,Summary,Quote,Page Number,Recommendation\n';
            manuscript.analysisReport.forEach(f => {
                csvContent += [f.priority, f.issueCategory, f.summary, f.quote, f.pageNumber, f.recommendation].map(escapeCsvField).join(',') + '\n';
            });
            csvContent += '\n';
        }

        if (manuscript.journalRecommendations && manuscript.journalRecommendations.length > 0) {
            csvContent += '## JOURNAL RECOMMENDATIONS ##\n';
            csvContent += 'Journal Name,Publisher,ISSN,Field,Reasoning\n';
            manuscript.journalRecommendations.forEach(rec => {
                csvContent += [rec.journalName, rec.publisher, rec.issn, rec.field, rec.reasoning].map(escapeCsvField).join(',') + '\n';
            });
            csvContent += '\n';
        }

        if (manuscript.metadataAnalysisReport) {
            csvContent += '## METADATA ANALYSIS REPORT ##\n';
            csvContent += 'Category,Details\n';
            csvContent += `Predicted Section Type,${escapeCsvField(manuscript.metadataAnalysisReport.predictedSectionType)}\n`;
            csvContent += `Generated Keywords,"${manuscript.metadataAnalysisReport.generatedKeywords.map(escapeCsvField).join(', ')}"\n`;
            manuscript.metadataAnalysisReport.orcidValidation.forEach(o => {
                csvContent += `ORCID Validation,"Author: ${escapeCsvField(o.authorName)}, ORCID: ${escapeCsvField(o.orcid)}, Valid: ${o.isValid}"\n`;
            });
            manuscript.metadataAnalysisReport.fundingMetadata.forEach(f => {
                csvContent += `Funding,"Funder: ${escapeCsvField(f.funderName)}, Grant: ${escapeCsvField(f.grantNumber)}"\n`;
            });
             manuscript.metadataAnalysisReport.suggestedTaxonomy.forEach(t => {
                csvContent += `Taxonomy (${t.scheme}),"${t.tags.map(escapeCsvField).join(', ')}"\n`;
            });
            csvContent += '\n';
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        setStatusBarMessage(`Downloading report for ${manuscript.name}`, 'success');
    };
    
    const escapeCsvField = (field: any): string => {
        const stringField = String(field ?? '');
        if (/[",\n]/.test(stringField)) {
            return `"${stringField.replace(/"/g, '""')}"`;
        }
        return stringField;
    };


    return (
        <div className="animate-fade-in h-full flex flex-col p-4 md:p-6 lg:p-8 bg-slate-100 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 mr-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <div>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}>
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Journal Compliance Checker</h2>
                            <ChevronDownIcon className={`h-5 w-5 text-slate-500 transition-transform duration-300 ${isHeaderExpanded ? 'rotate-180' : ''}`} />
                        </div>
                        {isHeaderExpanded && (
                            <div className="animate-fade-in origin-top">
                                <p className="text-sm text-slate-500 mt-1">A comprehensive pre-submission evaluation tool for academic manuscripts.</p>
                                <ul className="list-disc list-inside text-sm text-slate-500 mt-2 space-y-1">
                                    <li>Compare manuscripts against custom publisher guidelines.</li>
                                    <li>Perform a full editorial analysis for grammar, clarity, and citation integrity.</li>
                                    <li>Receive a quantitative scoring report on key manuscript quality metrics.</li>
                                    <li>Get AI-powered journal recommendations based on your manuscript's content.</li>
                                    <li>Mimic peer reviewers with summaries, strengths/weaknesses, and reviewer concerns.</li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 overflow-x-auto">
                <button onClick={() => setActiveTab('profiles')} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'profiles' ? 'border-b-2 border-sky-500 text-sky-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Profiles & Rules</button>
                <button onClick={() => setActiveTab('projects')} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'projects' ? 'border-b-2 border-purple-500 text-purple-500' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Projects & Manuscripts</button>
            </div>
            
            <div className="flex-grow overflow-y-auto">
                {activeTab === 'profiles' && (
                    <section className="space-y-4 animate-fade-in">
                        <div className="flex justify-between items-center px-2">
                            <h3 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-indigo-500">Compliance Profiles</h3>
                            <button onClick={() => setModal('createProfile')} className="flex items-center px-3 py-2 text-sm bg-sky-500 text-white rounded-lg hover:bg-sky-600 shadow"><PlusCircleIcon className="h-5 w-5 mr-2"/>Create Profile</button>
                        </div>
                         {profiles.length === 0 ? (
                            <div className="text-center py-16 px-4 border-2 border-dashed rounded-lg">
                                <DocumentTextIcon className="mx-auto h-12 w-12 text-slate-400" />
                                <h3 className="mt-2 text-lg font-medium text-slate-800 dark:text-slate-200">No Profiles Yet</h3>
                                <p className="mt-1 text-sm text-slate-500">Get started by creating a compliance profile to hold your rule documents.</p>
                            </div>
                        ) : (
                            profiles.map(p => <ProfileCard key={p.id} profile={p} ruleFiles={ruleFiles} onExpandToggle={(id) => setExpandedSections(prev => ({...prev, [id]: !prev[id]}))} isExpanded={!!expandedSections[p.id]} onDelete={deleteComplianceProfile} onRuleDelete={(ruleId) => deleteRuleFileFromProfile(p.id, ruleId)} onDrop={(files) => onRulesDrop(files, p.id)} />)
                        )}
                    </section>
                )}

                {activeTab === 'projects' && (
                    <section className="space-y-4 animate-fade-in">
                        <div className="flex justify-between items-center px-2">
                            <h3 className="text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-fuchsia-500">Project Folders</h3>
                            <button onClick={() => { setSelectedProfileForFolder(profiles[0]?.id || null); setModal('createFolder')}} className="flex items-center px-3 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 shadow"><FolderIcon className="h-5 w-5 mr-2"/>Create Folder</button>
                        </div>
                         {folders.length === 0 ? (
                            <div className="text-center py-16 px-4 border-2 border-dashed rounded-lg">
                                <FolderIcon className="mx-auto h-12 w-12 text-slate-400" />
                                <h3 className="mt-2 text-lg font-medium text-slate-800 dark:text-slate-200">No Projects Yet</h3>
                                <p className="mt-1 text-sm text-slate-500">Create a project folder to upload and check manuscripts for compliance.</p>
                            </div>
                         ) : (
                            folders.map(f => <FolderCard key={f.id} folder={f} profiles={profiles} onExpandToggle={(id) => setExpandedSections(prev => ({...prev, [id]: !prev[id]}))} isExpanded={!!expandedSections[f.id]} onDelete={deleteJournalComplianceFolder} onMapProfile={(profId) => updateJournalComplianceFolderProfile(f.id, profId)} onManuscriptDelete={(manId) => deleteJournalComplianceManuscript(f.id, manId)} onDrop={(files) => onManuscriptsDrop(files, f.id)} onViewReport={(man) => {setSelectedManuscript(man); setReportTab('scoring'); setModal('viewReport');}} onViewLogs={(man) => {setSelectedManuscript(man); setModal('viewLogs');}} onDownloadReport={handleDownloadReport} />)
                         )}
                    </section>
                )}
            </div>

            <Modal isOpen={modal === 'createProfile'} onClose={() => setModal(null)} title="Create New Profile">
                <form onSubmit={(e) => { e.preventDefault(); if (newProfileName.trim()) { createJournalComplianceProfile(newProfileName.trim()); setNewProfileName(''); setModal(null); } }} className="space-y-4">
                    <input type="text" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} placeholder="E.g., Journal of Clinical Studies" className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600" />
                    <div className="flex justify-end mt-4 space-x-2"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 rounded-md">Cancel</button><button type="submit" className="px-4 py-2 bg-sky-500 text-white rounded-md">Create</button></div>
                </form>
            </Modal>
            <Modal isOpen={modal === 'createFolder'} onClose={() => setModal(null)} title="Create New Folder">
                 <form onSubmit={(e) => { e.preventDefault(); if(newFolderName.trim()) { createJournalComplianceFolder(newFolderName.trim(), selectedProfileForFolder); setNewFolderName(''); setSelectedProfileForFolder(null); setModal(null); } }} className="space-y-4">
                    <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="E.g., October Submissions" className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600" />
                    <select value={selectedProfileForFolder || ''} onChange={e => setSelectedProfileForFolder(e.target.value || null)} className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600">
                        <option value="">No Profile Mapped</option>
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="flex justify-end mt-4 space-x-2"><button type="button" onClick={() => setModal(null)} className="px-4 py-2 bg-slate-200 dark:bg-slate-600 rounded-md">Cancel</button><button type="submit" className="px-4 py-2 bg-purple-500 text-white rounded-md">Create</button></div>
                </form>
            </Modal>
            <Modal isOpen={modal === 'viewReport' && !!selectedManuscript} onClose={() => setModal(null)} title={`Report: ${selectedManuscript?.name}`} size="2xl">
                <div className="flex border-b border-slate-700 mb-4 overflow-x-auto">
                    <button onClick={() => setReportTab('scoring')} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${reportTab === 'scoring' ? 'border-b-2 border-teal-500 text-teal-400' : 'text-slate-400 hover:text-white'}`}>Scoring Report</button>
                    <button onClick={() => setReportTab('compliance')} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${reportTab === 'compliance' ? 'border-b-2 border-purple-500 text-purple-400' : 'text-slate-400 hover:text-white'}`}>Compliance ({selectedManuscript?.complianceReport?.length || 0})</button>
                    <button onClick={() => setReportTab('analysis')} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${reportTab === 'analysis' ? 'border-b-2 border-yellow-500 text-yellow-400' : 'text-slate-400 hover:text-white'}`}>Manuscript Analysis ({selectedManuscript?.analysisReport?.length || 0})</button>
                    <button onClick={() => setReportTab('peerReview')} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${reportTab === 'peerReview' ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-slate-400 hover:text-white'}`}>Peer Review</button>
                    <button onClick={() => setReportTab('recommendations')} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${reportTab === 'recommendations' ? 'border-b-2 border-sky-500 text-sky-400' : 'text-slate-400 hover:text-white'}`}>Recommendations ({selectedManuscript?.journalRecommendations?.length || 0})</button>
                    <button onClick={() => setReportTab('metadata')} className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${reportTab === 'metadata' ? 'border-b-2 border-pink-500 text-pink-400' : 'text-slate-400 hover:text-white'}`}>Metadata Analysis</button>
                </div>
                 <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-2">
                    {reportTab === 'scoring' && (selectedManuscript?.scores ? <ScoringDashboard scores={selectedManuscript.scores} /> : <p className="text-center text-slate-500 py-8">Scoring data is not available for this manuscript.</p>)}
                    {reportTab === 'compliance' && (
                        (selectedManuscript?.complianceReport || []).length === 0 ? <p className="text-center text-slate-500 py-8">No compliance issues found.</p> :
                        selectedManuscript?.complianceReport?.map((finding, index) => (
                            <div key={index} className="bg-slate-900 rounded-lg p-4">
                               <div className="flex items-start justify-between gap-4">
                                    <h4 className="font-semibold text-lg mb-2 text-slate-200 flex-1">{finding.checkCategory}</h4>{renderStatusIcon(finding.status)}
                               </div>
                               <p className="text-sm text-slate-400 italic mb-4">"{finding.summary}"</p>
                               <div className="space-y-3 text-sm">
                                    <p><strong className="font-medium text-cyan-400">Recommendation:</strong> <span className="text-slate-300">{finding.recommendation}</span></p>
                                    <p><strong className="font-medium text-cyan-400">Manuscript (p. {finding.manuscriptPage}):</strong> <span className="text-slate-300 italic">"{finding.manuscriptQuote}"</span></p>
                                    <p><strong className="font-medium text-cyan-400">Rule (p. {finding.rulePage}):</strong> <span className="text-slate-300 italic">"{finding.ruleContent}"</span></p>
                               </div>
                            </div>
                        ))
                    )}
                     {reportTab === 'analysis' && (
                        (selectedManuscript?.analysisReport || []).length === 0 ? <p className="text-center text-slate-500 py-8">No editorial issues found.</p> :
                        selectedManuscript?.analysisReport?.map((finding, index) => (
                            <div key={index} className="bg-slate-900 rounded-lg p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <h4 className="font-semibold text-lg mb-2 text-slate-200 flex-1">{finding.issueCategory}</h4>
                                    {renderPriorityVisuals(finding.priority).icon}
                               </div>
                               <div className="flex items-center justify-between mb-3">
                                   <p className="text-sm text-slate-400 italic">"{finding.summary}"</p>
                                   {renderPriorityVisuals(finding.priority).tag}
                               </div>
                               <div className="space-y-3 text-sm">
                                    <p><strong className="font-medium text-yellow-400">Location:</strong> <span className="text-slate-300">Page {finding.pageNumber}</span></p>
                                    <p><strong className="font-medium text-yellow-400">Quote:</strong> <span className="text-slate-300 italic">"{finding.quote}"</span></p>
                                    <p><strong className="font-medium text-yellow-400">Recommendation:</strong> <span className="text-slate-300">{finding.recommendation}</span></p>
                               </div>
                            </div>
                        ))
                    )}
                    {reportTab === 'peerReview' && (
                        !selectedManuscript?.peerReviewSimulation ? <p className="text-center text-slate-500 py-8">No peer review simulation available.</p> :
                        <div className="space-y-6">
                            <div className="bg-slate-900 rounded-lg p-6">
                                <h4 className="text-lg font-semibold text-indigo-400 mb-2">Manuscript Summary</h4>
                                <p className="text-slate-300 leading-relaxed">{selectedManuscript.peerReviewSimulation.manuscriptSummary}</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-slate-900 rounded-lg p-6 border-l-4 border-green-500">
                                    <h4 className="text-lg font-semibold text-green-400 mb-3">Key Strengths</h4>
                                    <ul className="list-disc list-inside space-y-2 text-slate-300">
                                        {selectedManuscript.peerReviewSimulation.strengths.map((s, i) => <li key={i}>{s}</li>)}
                                    </ul>
                                </div>
                                <div className="bg-slate-900 rounded-lg p-6 border-l-4 border-red-500">
                                    <h4 className="text-lg font-semibold text-red-400 mb-3">Weaknesses & Limitations</h4>
                                    <ul className="list-disc list-inside space-y-2 text-slate-300">
                                        {selectedManuscript.peerReviewSimulation.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-lg p-6">
                                <h4 className="text-lg font-semibold text-indigo-400 mb-3">Reviewer Concerns</h4>
                                <ul className="space-y-3">
                                    {selectedManuscript.peerReviewSimulation.reviewerConcerns.map((c, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-indigo-900 text-indigo-300 rounded-full text-xs font-bold">{i + 1}</span>
                                            <span className="text-slate-300">{c}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="bg-slate-900 rounded-lg p-6">
                                <h4 className="text-lg font-semibold text-indigo-400 mb-2">Methodological Gaps</h4>
                                <p className="text-slate-300">{selectedManuscript.peerReviewSimulation.methodologicalGaps}</p>
                            </div>

                            <div className="bg-slate-900 rounded-lg p-6">
                                <h4 className="text-lg font-semibold text-indigo-400 mb-3">Likely Reviewer Questions</h4>
                                <ul className="list-disc list-inside space-y-2 text-slate-300">
                                    {selectedManuscript.peerReviewSimulation.reviewerQuestions.map((q, i) => <li key={i}>{q}</li>)}
                                </ul>
                            </div>

                            <div className="bg-gradient-to-r from-indigo-900 to-slate-900 rounded-lg p-6 border border-indigo-700">
                                <h4 className="text-lg font-semibold text-white mb-2">Suitability for Peer Review</h4>
                                <p className="text-indigo-200 text-lg font-medium">{selectedManuscript.peerReviewSimulation.suitabilityForPeerReview}</p>
                            </div>
                        </div>
                    )}
                    {reportTab === 'recommendations' && (
                        (selectedManuscript?.journalRecommendations || []).length === 0 ? <p className="text-center text-slate-500 py-8">No journal recommendations were generated.</p> :
                        selectedManuscript?.journalRecommendations?.map((rec, index) => (
                            <div key={index} className="bg-slate-900 rounded-lg p-4">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 bg-purple-900/50 border border-purple-500/50 rounded-full"><BookOpenIcon className="h-6 w-6 text-purple-400" /></div>
                                    <div className="flex-1">
                                        <h5 className="font-semibold text-lg text-slate-100">{rec.journalName}</h5>
                                        <p className="text-sm text-slate-400">{rec.publisher} {rec.issn && `• ISSN: ${rec.issn}`}</p>
                                        <p className="mt-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-900/50 text-purple-400 inline-block">{rec.field}</p>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm text-slate-300"><strong className="font-medium text-purple-400">Reasoning:</strong> {rec.reasoning}</p>
                            </div>
                        ))
                    )}
                    {reportTab === 'metadata' && (
                        !selectedManuscript?.metadataAnalysisReport ? <p className="text-center text-slate-500 py-8">No metadata analysis available.</p> :
                        <div className="space-y-6">
                            <div className="bg-slate-900 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-pink-400 mb-3">Predicted Section & Keywords</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-slate-400">Predicted Section Type</p>
                                        <p className="text-lg font-medium text-slate-200">{selectedManuscript.metadataAnalysisReport.predictedSectionType}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-400 mb-2">Generated Keywords</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedManuscript.metadataAnalysisReport.generatedKeywords.map((kw, i) => (
                                                <span key={i} className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded-full border border-slate-700">{kw}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-pink-400 mb-3">Corresponding Author</h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-md">
                                        <span className="text-slate-300">Name</span>
                                        <span className="text-slate-100 font-medium">{selectedManuscript.metadataAnalysisReport.correspondingAuthor.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-md">
                                        <span className="text-slate-300">Email</span>
                                        <span className="text-slate-100 font-medium">{selectedManuscript.metadataAnalysisReport.correspondingAuthor.email || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-800/50 p-3 rounded-md">
                                        <span className="text-slate-300">Affiliation</span>
                                        <span className="text-slate-100 font-medium text-right max-w-xs truncate">{selectedManuscript.metadataAnalysisReport.correspondingAuthor.affiliation || 'N/A'}</span>
                                    </div>
                                    <div className="mt-2 text-right">
                                        {selectedManuscript.metadataAnalysisReport.correspondingAuthor.isComplete ? 
                                            <span className="text-green-400 text-sm flex items-center justify-end"><CheckIcon className="h-4 w-4 mr-1"/> Information Complete</span> : 
                                            <span className="text-red-400 text-sm flex items-center justify-end"><XIcon className="h-4 w-4 mr-1"/> Information Incomplete</span>
                                        }
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-900 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-pink-400 mb-3">ORCID Validation</h4>
                                {selectedManuscript.metadataAnalysisReport.orcidValidation.length === 0 ? <p className="text-slate-500 text-sm">No ORCIDs found.</p> : 
                                    <div className="space-y-2">
                                        {selectedManuscript.metadataAnalysisReport.orcidValidation.map((orcid, i) => (
                                            <div key={i} className="flex justify-between items-center bg-slate-800/50 p-3 rounded-md border border-slate-700">
                                                <div>
                                                    <p className="text-slate-200 font-medium">{orcid.authorName}</p>
                                                    <p className="text-sm text-slate-400">{orcid.orcid}</p>
                                                </div>
                                                {orcid.isValid ? 
                                                    <span className="px-2 py-1 bg-green-900/50 text-green-400 text-xs rounded border border-green-500/50">Valid</span> : 
                                                    <span className="px-2 py-1 bg-red-900/50 text-red-400 text-xs rounded border border-red-500/50">Invalid Format</span>
                                                }
                                            </div>
                                        ))}
                                    </div>
                                }
                            </div>

                            <div className="bg-slate-900 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-pink-400 mb-3">Funding Metadata</h4>
                                {selectedManuscript.metadataAnalysisReport.fundingMetadata.length === 0 ? <p className="text-slate-500 text-sm">No funding information detected.</p> : 
                                    <ul className="space-y-2">
                                        {selectedManuscript.metadataAnalysisReport.fundingMetadata.map((fund, i) => (
                                            <li key={i} className="bg-slate-800/50 p-3 rounded-md border border-slate-700">
                                                <p className="text-slate-200 font-medium">{fund.funderName}</p>
                                                {fund.grantNumber && <p className="text-sm text-slate-400 mt-1">Grant: {fund.grantNumber}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                }
                            </div>

                            <div className="bg-slate-900 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-pink-400 mb-3">Suggested Taxonomy</h4>
                                <div className="space-y-4">
                                    {selectedManuscript.metadataAnalysisReport.suggestedTaxonomy.map((tax, i) => (
                                        <div key={i}>
                                            <h5 className="text-sm font-semibold text-slate-300 mb-2">{tax.scheme}</h5>
                                            <div className="flex flex-wrap gap-2">
                                                {tax.tags.map((tag, j) => (
                                                    <span key={j} className="px-2 py-1 bg-slate-800 text-sky-300 text-xs rounded border border-sky-900/50">{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="text-center pt-4 border-t border-slate-700 mt-4"><button onClick={() => selectedManuscript && handleDownloadReport(selectedManuscript)} className="text-sm text-slate-400 hover:underline">Download Full Report (CSV)</button></div>
            </Modal>
             <Modal isOpen={modal === 'viewLogs' && !!selectedManuscript} onClose={() => setModal(null)} title={`Logs: ${selectedManuscript?.name}`}>
                <div className="bg-slate-900 text-white font-mono text-xs rounded-md p-4 max-h-96 overflow-y-auto">
                    {(selectedManuscript?.logs || []).map((log, index) => <p key={index}>{log}</p>)}
                </div>
            </Modal>
        </div>
    );
};

// ... (ProfileCard, ManuscriptRow, FolderCard, export default BookComplianceChecker)
const ProfileCard: React.FC<{ profile: ComplianceProfile; ruleFiles: Record<string, RuleFile>; isExpanded: boolean; onExpandToggle: (id: string) => void; onDelete: (id: string) => void; onRuleDelete: (ruleId: string) => void; onDrop: (files: File[]) => void; }> = ({ profile, ruleFiles, isExpanded, onExpandToggle, onDelete, onRuleDelete, onDrop }) => {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } });
    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden transition-all duration-300">
            <button onClick={() => onExpandToggle(profile.id)} className="w-full p-4 flex justify-between items-center text-left hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <div><p className="font-bold text-lg text-slate-800 dark:text-slate-100">{profile.name}</p><p className="text-sm text-slate-500">{profile.ruleFileIds.length} rule file(s)</p></div>
                <div className="flex items-center space-x-2">
                    <button onClick={(e) => { e.stopPropagation(); onDelete(profile.id)}} className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon className="h-5 w-5"/></button>
                    <ChevronDownIcon className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/>
                </div>
            </button>
            {isExpanded && <div className="p-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                {profile.ruleFileIds.map(id => (<div key={id} className="flex justify-between items-center bg-slate-100 dark:bg-slate-700/50 p-2 rounded-md"><p className="text-sm truncate">{ruleFiles[id]?.name}</p><button onClick={() => onRuleDelete(id)} className="text-slate-400 hover:text-red-500 ml-2"><XIcon className="h-4 w-4"/></button></div>))}
                <div {...getRootProps()} className="mt-2 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
                    <input {...getInputProps()} />
                    <UploadIcon className="h-8 w-8 mx-auto" />
                    <p className="mt-2 text-sm">Add Rule Document(s) (.pdf, .docx)</p>
                    <div className="mt-2 flex items-center justify-center text-xs text-slate-500">
                        <ShieldCheckIcon className="h-4 w-4 mr-1.5 text-green-500"/>
                        <span>Your files are processed securely.</span>
                    </div>
                </div>
            </div>}
        </div>
    );
};

const ManuscriptRow: React.FC<{ manuscript: ManuscriptFile; onViewReport: (m: ManuscriptFile) => void; onViewLogs: (m: ManuscriptFile) => void; onManuscriptDelete: (id: string) => void; onDownloadReport: (m: ManuscriptFile) => void; }> = ({ manuscript, onViewReport, onViewLogs, onManuscriptDelete, onDownloadReport }) => (
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
                        <button onClick={() => onViewReport(manuscript)} className="px-2 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/50 rounded-md hover:bg-sky-200 dark:hover:bg-sky-900">View Report</button>
                        <button onClick={() => onDownloadReport(manuscript)} className="px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500 inline-flex items-center"><DownloadIcon className="h-3 w-3 mr-1.5"/>Download</button>
                    </>
                )}
                <button onClick={() => onViewLogs(manuscript)} title="View Logs" className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full"><ClipboardListIcon className="h-4 w-4"/></button>
                <button onClick={() => onManuscriptDelete(manuscript.id)} title="Delete" className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><TrashIcon className="h-4 w-4"/></button>
            </div>
        </div>
        {manuscript.status === 'processing' && <div className="mt-2"><div className="w-full bg-slate-300 dark:bg-slate-600 rounded-full h-1.5"><div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${manuscript.progress || 0}%` }}></div></div></div>}
    </div>
);


const FolderCard: React.FC<{ folder: ComplianceProjectFolder; profiles: ComplianceProfile[]; isExpanded: boolean; onExpandToggle: (id: string) => void; onDelete: (id: string) => void; onMapProfile: (profId: string | null) => void; onManuscriptDelete: (id: string) => void; onDrop: (files: File[]) => void; onViewReport: (m: ManuscriptFile) => void; onViewLogs: (m: ManuscriptFile) => void; onDownloadReport: (m: ManuscriptFile) => void; }> = ({ folder, profiles, isExpanded, onExpandToggle, onDelete, onMapProfile, onManuscriptDelete, onDrop, onViewReport, onViewLogs, onDownloadReport }) => {
    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } });
    return (
         <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md transition-all duration-300">
            <button onClick={() => onExpandToggle(folder.id)} className="w-full p-4 flex justify-between items-center text-left hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <div><p className="font-bold text-lg text-slate-800 dark:text-slate-100">{folder.name}</p><div className="mt-1" onClick={e => e.stopPropagation()}><select value={folder.profileId || ''} onChange={e => onMapProfile(e.target.value || null)} className="text-sm bg-slate-100 dark:bg-slate-700 border rounded-md p-1 focus:ring-purple-500 focus:border-purple-500"><option value="">-- Map a Profile --</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
                <div className="flex items-center space-x-2"><button onClick={(e) => { e.stopPropagation(); onDelete(folder.id)}} className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50"><TrashIcon className="h-5 w-5"/></button><ChevronDownIcon className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}/></div>
            </button>
            {isExpanded && <div className="p-4 border-t border-slate-200 dark:border-slate-700">
                <div className="space-y-2">{folder.manuscripts.map(m => <ManuscriptRow key={m.id} manuscript={m} onViewReport={onViewReport} onViewLogs={onViewLogs} onManuscriptDelete={onManuscriptDelete} onDownloadReport={onDownloadReport} />)}</div>
                <div {...getRootProps()} className="mt-4 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                    <input {...getInputProps()} />
                    <UploadIcon className="h-8 w-8 mx-auto" />
                    <p className="mt-2 text-sm">Upload Manuscripts (.pdf, .docx)</p>
                    <div className="mt-2 flex items-center justify-center text-xs text-slate-500">
                        <ShieldCheckIcon className="h-4 w-4 mr-1.5 text-green-500"/>
                        <span>Your files are processed securely.</span>
                    </div>
                </div>
            </div>}
        </div>
    );
};

export default JournalComplianceChecker;