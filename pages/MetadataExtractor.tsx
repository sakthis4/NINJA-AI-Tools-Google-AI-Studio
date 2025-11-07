import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { ExtractedAsset, BoundingBox, MetadataProjectFolder, PdfFile, PdfFileStatus } from '../types';
import { useAppContext } from '../hooks/useAppContext';
import { extractAssetsFromPage, generateMetadataForCroppedImage } from '../services/geminiService';
import Spinner from '../components/Spinner';
import { UploadIcon, ChevronLeftIcon, SparklesIcon, DownloadIcon, TrashIcon, ChevronDownIcon, XIcon, CursorClickIcon, ExclamationIcon, FolderIcon, DocumentTextIcon, PlusCircleIcon, ClipboardListIcon } from '../components/icons/Icons';
import * as pdfjsLib from 'pdfjs-dist';
import Modal from '../components/Modal';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

// --- Helper Functions ---
const sortAssets = (assets: ExtractedAsset[]): ExtractedAsset[] => {
    return assets.sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) {
            return (a.pageNumber ?? 0) - (b.pageNumber ?? 0);
        }
        if (a.boundingBox && b.boundingBox) {
            return a.boundingBox.y - b.boundingBox.y;
        }
        return 0;
    });
};

const LazyPdfPage = ({ pdfDoc, pageNum, scale, viewerRef }: { pdfDoc: pdfjsLib.PDFDocumentProxy; pageNum: number; scale: number; viewerRef: React.RefObject<HTMLDivElement> }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isIntersecting, setIsIntersecting] = useState(false);
    const [isRendered, setIsRendered] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) { setIsIntersecting(true); observer.unobserve(entry.target); }
        }, { root: viewerRef.current, rootMargin: "500px 0px" });
        if (containerRef.current) observer.observe(containerRef.current);
        return () => { if (containerRef.current) observer.unobserve(containerRef.current); };
    }, [viewerRef]);

    useEffect(() => {
        if (!isIntersecting || isRendered || scale <= 0) return;
        let isCancelled = false;
        pdfDoc.getPage(pageNum).then(page => {
            if (isCancelled || !canvasRef.current) return;
            const viewport = page.getViewport({ scale });
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');
            if (!context) return;
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            page.render({ canvasContext: context, viewport, canvas: canvas as any }).promise.then(() => {
                if (!isCancelled) setIsRendered(true);
            });
        });
        return () => { isCancelled = true; };
    }, [isIntersecting, isRendered, pdfDoc, pageNum, scale]);

    return (
        <div ref={containerRef} className="absolute inset-0">
            {isIntersecting && <canvas ref={canvasRef} className={isRendered ? 'block' : 'hidden'} />}
            {isIntersecting && !isRendered && (
                <div className="w-full h-full flex items-center justify-center bg-gray-300 dark:bg-gray-600">
                    <Spinner size="md" />
                </div>
            )}
        </div>
    );
};

// --- Editor View Component ---
const EditorView = ({ folder, pdfFile, onBack, onAssetUpdate, onAssetDelete, onRegenerate, onExport }: {
    folder: MetadataProjectFolder,
    pdfFile: PdfFile,
    onBack: () => void,
    onAssetUpdate: (assetId: string, field: keyof ExtractedAsset, value: any) => void,
    onAssetDelete: (assetId: string) => void,
    onRegenerate: (assetId: string) => void,
    onExport: (pdfFile: PdfFile) => void,
}) => {
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [pdfScale, setPdfScale] = useState(0);
    const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number; }[]>([]);
    const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
    const viewerRef = useRef<HTMLDivElement>(null);
    const resizeTimer = useRef<ReturnType<typeof setTimeout>>();

    const updatePdfDimensions = useCallback(async (pdf: pdfjsLib.PDFDocumentProxy) => {
        if (!viewerRef.current) return;
        await new Promise(resolve => setTimeout(resolve, 0));
        const container = viewerRef.current;
        const style = window.getComputedStyle(container);
        const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const availableWidth = container.clientWidth - paddingX;
        if (availableWidth <= 0) return;

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const newScale = availableWidth / viewport.width;
        setPdfScale(newScale);

        const dimensions = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const p = await pdf.getPage(i);
            const vp = p.getViewport({ scale: newScale });
            dimensions.push({ width: vp.width, height: vp.height });
        }
        setPageDimensions(dimensions);
    }, []);
    
    useEffect(() => {
        if (pdfFile.file) {
            const loadPdf = async () => {
                const fileBuffer = await pdfFile.file!.arrayBuffer();
                // FIX: Pass the file buffer as an object with a 'data' property to pdfjsLib.getDocument.
                const loadingTask = pdfjsLib.getDocument({ data: fileBuffer });
                const pdf = await loadingTask.promise;
                setPdfDoc(pdf);
                pageRefs.current = Array(pdf.numPages).fill(null);
                updatePdfDimensions(pdf);
            };
            loadPdf();
        }
    }, [pdfFile.file, updatePdfDimensions]);

    useEffect(() => {
        if (!pdfDoc) return;
        const handleResize = () => {
            if (resizeTimer.current) clearTimeout(resizeTimer.current);
            resizeTimer.current = setTimeout(() => updatePdfDimensions(pdfDoc), 200);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [pdfDoc, updatePdfDimensions]);

    useEffect(() => {
        if (selectedAssetId) {
            const asset = pdfFile.assets?.find(a => a.id === selectedAssetId);
            if (asset && asset.pageNumber) {
                pageRefs.current[asset.pageNumber - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [selectedAssetId, pdfFile.assets]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center mb-4 flex-shrink-0">
                <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3">
                    <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white truncate" title={pdfFile.name}>{pdfFile.name}</h2>
                    <p className="text-sm text-gray-500">Folder: {folder.name}</p>
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-hidden">
                {/* PDF Viewer */}
                <div ref={viewerRef} className="overflow-y-auto bg-gray-200 dark:bg-gray-700 p-2 md:p-4 rounded-lg shadow-inner">
                    {pdfDoc && pageDimensions.length > 0 ? pageDimensions.map((dim, index) => (
                        <div key={`page_${index + 1}`} ref={el => { pageRefs.current[index] = el; }} data-page-index={index}
                             className="relative shadow-lg mb-4 bg-white dark:bg-gray-800 mx-auto"
                             style={{ width: dim.width, height: dim.height }}>
                            <LazyPdfPage pdfDoc={pdfDoc} pageNum={index + 1} scale={pdfScale} viewerRef={viewerRef} />
                        </div>
                    )) : (
                         <div className="flex flex-col items-center justify-center h-full text-center text-gray-600 dark:text-gray-400">
                             <DocumentTextIcon className="h-24 w-24 opacity-50"/>
                            <p className="mt-4 font-semibold">PDF preview not available</p>
                            <p className="text-sm">Original file was not found in this session.</p>
                        </div>
                    )}
                </div>
                {/* Metadata Editor */}
                 <div className="flex flex-col h-full overflow-hidden">
                     <div className="bg-white dark:bg-gray-800 p-2 md:p-4 rounded-lg shadow-md mb-4 flex-shrink-0">
                         <div className="flex justify-between items-center">
                            <h3 className="text-base md:text-lg font-semibold">Extracted Assets ({pdfFile.assets?.length || 0})</h3>
                            <button onClick={() => onExport(pdfFile)} className="px-2 py-1.5 text-xs md:text-sm bg-green-500 text-white rounded-md hover:bg-green-600 inline-flex items-center">
                                <DownloadIcon className="h-4 w-4 mr-1"/>Export CSV
                            </button>
                        </div>
                    </div>
                    <div className="space-y-3 pb-4 flex-grow overflow-y-auto pr-2">
                        {pdfFile.assets && sortAssets([...pdfFile.assets]).map(asset => {
                             const isSelected = selectedAssetId === asset.id;
                             return (
                                <div key={asset.id} className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border ${isSelected ? 'border-primary-500' : 'border-transparent'}`}>
                                    <button onClick={() => setSelectedAssetId(isSelected ? null : asset.id)} className="w-full flex items-center justify-between p-4 text-left">
                                        <div className="flex-1 overflow-hidden">
                                            <div className="font-semibold text-gray-800 dark:text-white truncate">{asset.assetId} - <span className="font-normal text-gray-500 dark:text-gray-400">{asset.assetType} on Page {asset.pageNumber}</span></div>
                                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 truncate">{asset.preview}</p>
                                        </div>
                                        <ChevronDownIcon className={`h-5 w-5 text-gray-500 transition-transform duration-300 ${isSelected ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isSelected && (
                                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 animate-fade-in space-y-4">
                                             <div>
                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                                                    <span>Alt Text</span>
                                                    <button onClick={() => onRegenerate(asset.id)} className="p-1 text-xs text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center">
                                                        <SparklesIcon className="h-3 w-3 mr-1"/>Regenerate
                                                    </button>
                                                </label>
                                                <textarea value={asset.altText} onChange={e => onAssetUpdate(asset.id, 'altText', e.target.value)} className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-sm h-24 focus:ring-primary-500 focus:border-primary-500" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Keywords</label>
                                                <div className="mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 min-h-[50px]">
                                                    <div className="flex flex-wrap gap-2 items-center">
                                                        {asset.keywords.map((k, index) => (
                                                            <span key={index} className="flex items-center text-sm bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded-full">
                                                                {k}
                                                                <button onClick={() => onAssetUpdate(asset.id, 'keywords', asset.keywords.filter((_, i) => i !== index))} className="ml-1.5 text-gray-500 dark:text-gray-300 hover:text-red-500"><XIcon className="h-3 w-3" /></button>
                                                            </span>
                                                        ))}
                                                        <input type="text" placeholder="Add..." onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { e.preventDefault(); onAssetUpdate(asset.id, 'keywords', [...asset.keywords, e.currentTarget.value.trim()]); e.currentTarget.value = ''; } }} className="flex-grow bg-transparent focus:outline-none text-sm p-1"/>
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Taxonomy</label>
                                                <input type="text" value={asset.taxonomy} onChange={e => onAssetUpdate(asset.id, 'taxonomy', e.target.value)} className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700/50 text-sm focus:ring-primary-500 focus:border-primary-500" />
                                            </div>
                                            <div className="text-right">
                                                <button onClick={() => onAssetDelete(asset.id)} className="inline-flex items-center px-3 py-1.5 text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 rounded-md hover:bg-red-200 dark:hover:bg-red-900">
                                                    <TrashIcon className="h-4 w-4 mr-2"/>Delete Asset
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                         })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Dashboard Component ---
export default function MetadataExtractor({ onBack }: { onBack: () => void }) {
    const { currentUser, addUsageLog, addToast } = useAppContext();

    const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
    const [currentPdf, setCurrentPdf] = useState<{ folderId: string, pdfId: string } | null>(null);

    const [folders, setFolders] = useState<MetadataProjectFolder[]>(() => {
        try {
            const saved = localStorage.getItem('metadata_folders');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });
    const transientFiles = useRef<Map<string, File>>(new Map());
    
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    
    const [logModalState, setLogModalState] = useState({ isOpen: false, logs: [] as string[], fileName: '' });

    // Persist state to localStorage, excluding transient file objects
    useEffect(() => {
        const foldersToSave = folders.map(folder => ({
            ...folder,
            pdfFiles: folder.pdfFiles.map(({ file, ...rest }) => rest),
        }));
        localStorage.setItem('metadata_folders', JSON.stringify(foldersToSave));
    }, [folders]);

    const addLog = (pdfId: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        setFolders(prev => prev.map(f => ({
            ...f,
            pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, logs: [...(p.logs || []), formattedMessage] } : p)
        })));
        setLogModalState(prev => {
            const targetPdf = folders.flatMap(f => f.pdfFiles).find(p => p.id === pdfId);
            if(prev.isOpen && prev.fileName === targetPdf?.name) {
                return { ...prev, logs: [...(targetPdf?.logs || []), formattedMessage] };
            }
            return prev;
        });
    };

    const onDrop = useCallback((acceptedFiles: File[], folderId: string) => {
        const newPdfFiles: PdfFile[] = acceptedFiles.map(file => {
            const id = `${performance.now()}-${Math.random().toString(36).substring(2, 9)}`;
            transientFiles.current.set(id, file); // Store file object in ref
            return { id, name: file.name, status: 'queued', logs: [] };
        });
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, pdfFiles: [...f.pdfFiles, ...newPdfFiles] } : f));
        setProcessingQueue(prev => [...prev, ...newPdfFiles.map(m => m.id)]);
        addToast({ type: 'info', message: `${newPdfFiles.length} file(s) added to queue.` });
    }, [addToast]);

    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        setFolders(prev => [...prev, { id: `${performance.now()}-${Math.random().toString(36).substring(2, 9)}`, name: newFolderName, pdfFiles: [] }]);
        setNewFolderName('');
        setCreateFolderModalOpen(false);
    };

    const handleDeleteFolder = (folderId: string) => {
        setFolders(prev => prev.filter(f => f.id !== folderId));
    };
    
    // --- Queue Processing Logic ---
     useEffect(() => {
        const processNextInQueue = async () => {
            if (isProcessing || processingQueue.length === 0) return;
            setIsProcessing(true);
            const pdfId = processingQueue[0];
            
            const findResult = folders.reduce<{ folder?: MetadataProjectFolder, pdfFile?: PdfFile }>((acc, f) => {
                const pdf = f.pdfFiles.find(p => p.id === pdfId);
                if (pdf) { acc.folder = f; acc.pdfFile = pdf; }
                return acc;
            }, {});

            const { pdfFile } = findResult;
            const fileObject = transientFiles.current.get(pdfId);

            const updatePdfFile = (status: PdfFileStatus, data: Partial<PdfFile>) => {
                setFolders(prev => prev.map(f => ({
                    ...f,
                    pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, status, ...data } : p)
                })));
            };
            
            if (!pdfFile || !fileObject) {
                addLog(pdfId, "ERROR: File object not found for processing.");
                updatePdfFile('error', { logs: [...(pdfFile?.logs || []), `[ERROR] File not found for processing.`] });
                setIsProcessing(false);
                setProcessingQueue(q => q.slice(1));
                return;
            }

            addLog(pdfId, `Starting processing for ${fileObject.name}.`);
            updatePdfFile('processing', {});
            let hasErrors = false;

            try {
                addLog(pdfId, `Loading PDF...`);
                const fileBuffer = await fileObject.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: fileBuffer }).promise;
                
                let allAssets: ExtractedAsset[] = [];
                addLog(pdfId, `PDF has ${pdf.numPages} pages. Beginning asset extraction.`);

                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                     try {
                        addLog(pdfId, `Processing page ${pageNum}/${pdf.numPages}...`);
                        const page = await pdf.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 1.5 });
                        const canvas = document.createElement('canvas');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        const context = canvas.getContext('2d');
                        await page.render({ canvasContext: context!, viewport, canvas: canvas as any }).promise;
                        const pageImageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                        
                        const assetsOnPage = await extractAssetsFromPage(pageImageBase64);

                        if (assetsOnPage.length > 0) {
                            addLog(pdfId, `Found ${assetsOnPage.length} asset(s) on page ${pageNum}.`);
                            allAssets = [...allAssets, ...assetsOnPage.map(asset => ({...asset, id: `${performance.now()}-${Math.random().toString(36).substring(2, 9)}`, pageNumber: pageNum}))];
                        }
                        
                        if (pageNum < pdf.numPages) {
                           await new Promise(resolve => setTimeout(resolve, 1100)); // Proactive delay
                        }
                    } catch (pageError) {
                        hasErrors = true;
                        const errorMessage = pageError instanceof Error ? pageError.message : "Unknown error during page processing.";
                        addLog(pdfId, `ERROR on page ${pageNum}: ${errorMessage}`);
                    }
                }
                
                updatePdfFile(hasErrors ? 'error' : 'completed', { assets: allAssets });
                addLog(pdfId, `Processing finished ${hasErrors ? 'with errors' : 'successfully'}.`);
                addUsageLog({ userId: currentUser!.id, toolName: 'Metadata Extractor' });

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Fatal processing failed";
                addLog(pdfId, `FATAL ERROR: ${errorMessage}`);
                updatePdfFile('error', {});
            } finally {
                setIsProcessing(false);
                setProcessingQueue(q => q.slice(1));
            }
        };
        processNextInQueue();
    }, [processingQueue, isProcessing, folders, addUsageLog, currentUser]);

    // --- Editor Actions ---
    const handleAssetUpdate = (pdfId: string, assetId: string, field: keyof ExtractedAsset, value: any) => {
        setFolders(prev => prev.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => 
            p.id === pdfId ? { ...p, assets: p.assets?.map(a => a.id === assetId ? { ...a, [field]: value } : a) } : p
        )})));
    };

    const handleAssetDelete = (pdfId: string, assetId: string) => {
        setFolders(prev => prev.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => 
            p.id === pdfId ? { ...p, assets: p.assets?.filter(a => a.id !== assetId) } : p
        )})));
    };
    
    const handlePdfDelete = (folderId: string, pdfId: string) => {
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, pdfFiles: f.pdfFiles.filter(p => p.id !== pdfId) } : f));
    };

    const handleExport = (pdfFile: PdfFile) => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Filename,Asset ID,Asset Type,Page/Location,Alt Text,Keywords,Taxonomy\n";
        pdfFile.assets?.forEach(asset => {
            const row = [pdfFile.name, asset.assetId, asset.assetType, asset.pageNumber, `"${asset.altText.replace(/"/g, '""')}"`, `"${asset.keywords.join(', ').replace(/"/g, '""')}"`, `"${asset.taxonomy.replace(/"/g, '""')}"`].join(',');
            csvContent += row + "\r\n";
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `${pdfFile.name}_metadata.csv`);
        link.click();
    };

    if (view === 'editor' && currentPdf) {
        const folder = folders.find(f => f.id === currentPdf.folderId);
        const pdfFile = folder?.pdfFiles.find(p => p.id === currentPdf.pdfId);
        if (folder && pdfFile) {
            // Re-attach transient file object if it exists for the editor view
            const transientFile = transientFiles.current.get(pdfFile.id);
            if(transientFile) pdfFile.file = transientFile;

            return <EditorView 
                folder={folder} 
                pdfFile={pdfFile} 
                onBack={() => setView('dashboard')}
                onAssetUpdate={(assetId, field, value) => handleAssetUpdate(pdfFile.id, assetId, field, value)}
                onAssetDelete={(assetId) => handleAssetDelete(pdfFile.id, assetId)}
                onRegenerate={() => {}}
                onExport={handleExport}
            />;
        }
    }

    return (
        <div className="animate-fade-in h-full flex flex-col p-4 md:p-6 lg:p-8 bg-gray-100 dark:bg-gray-900">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Metadata Extractor</h2>
                </div>
                <button onClick={() => setCreateFolderModalOpen(true)} className="flex items-center px-3 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 shadow"><PlusCircleIcon className="h-5 w-5 mr-2"/>New Folder</button>
            </div>
            {/* Dashboard */}
            <div className="flex-grow overflow-y-auto space-y-6">
                {folders.map(folder => <FolderCard key={folder.id} folder={folder} onDrop={onDrop} onView={(pdfId) => { setCurrentPdf({ folderId: folder.id, pdfId }); setView('editor');}} onDeletePdf={(pdfId) => handlePdfDelete(folder.id, pdfId)} onDeleteFolder={() => handleDeleteFolder(folder.id)} onShowLogs={(pdf) => setLogModalState({isOpen: true, logs: pdf.logs || [], fileName: pdf.name})} />)}
            </div>
            {/* Modals */}
             <Modal isOpen={createFolderModalOpen} onClose={() => setCreateFolderModalOpen(false)} title="Create New Folder">
                <form onSubmit={(e) => { e.preventDefault(); handleCreateFolder(); }} className="space-y-4">
                    <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder Name" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <div className="flex justify-end mt-4 space-x-2">
                        <button type="button" onClick={() => setCreateFolderModalOpen(false)} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded">Create</button>
                    </div>
                </form>
            </Modal>
            <Modal isOpen={logModalState.isOpen} onClose={() => setLogModalState({ isOpen: false, logs: [], fileName: '' })} title={`Logs: ${logModalState.fileName}`}>
                <div className="bg-gray-900 text-white font-mono text-xs rounded-md p-4 max-h-96 overflow-y-auto">
                    {logModalState.logs.length > 0 ? logModalState.logs.map((log, index) => <p key={index} className="whitespace-pre-wrap">{log}</p>) : <p>No logs available.</p>}
                </div>
            </Modal>
        </div>
    );
}

const FolderCard = ({ folder, onDrop, onView, onDeletePdf, onDeleteFolder, onShowLogs }: { folder: MetadataProjectFolder, onDrop: (files: File[], folderId: string) => void, onView: (pdfId: string) => void, onDeletePdf: (pdfId: string) => void, onDeleteFolder: () => void, onShowLogs: (pdf: PdfFile) => void }) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: (files) => onDrop(files, folder.id), accept: { 'application/pdf': ['.pdf'] }, noClick: true });
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <FolderIcon className="h-6 w-6 text-primary-500" />
                    <h3 className="font-bold text-lg">{folder.name}</h3>
                </div>
                <button onClick={onDeleteFolder} className="p-2 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"><TrashIcon className="h-5 w-5"/></button>
            </div>
            <div {...getRootProps({ className: `p-4 relative transition-colors ${isDragActive ? 'bg-primary-500/10' : ''}` })}>
                 {isDragActive && <div className="absolute inset-0 bg-primary-500/20 border-2 border-dashed border-primary-500 rounded-b-xl flex items-center justify-center"><p className="font-semibold text-primary-600">Drop files to upload</p></div>}
                <input {...getInputProps()} />
                <div className="space-y-2">
                    {folder.pdfFiles.map(pdf => <PdfFileRow key={pdf.id} pdf={pdf} onView={onView} onDelete={onDeletePdf} onShowLogs={onShowLogs}/>)}
                </div>
                <label className="mt-4 w-full text-center block cursor-pointer text-sm text-primary-600 dark:text-primary-400 hover:underline">
                    or click here to select files...
                    <input type="file" multiple accept=".pdf" className="hidden" onChange={(e) => e.target.files && onDrop(Array.from(e.target.files), folder.id)} />
                </label>
            </div>
        </div>
    );
};

const PdfFileRow = ({ pdf, onView, onDelete, onShowLogs }: { pdf: PdfFile, onView: (pdfId: string) => void, onDelete: (pdfId: string) => void, onShowLogs: (pdf: PdfFile) => void }) => {
    const statusStyles = {
        queued: 'text-gray-500',
        processing: 'text-blue-500 animate-pulse',
        completed: 'text-green-500',
        error: 'text-red-500',
    };
    return (
         <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-900/50 p-2 rounded-md">
            <div className="flex items-center gap-3 overflow-hidden">
                <DocumentTextIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                <p className="text-sm truncate flex-1">{pdf.name}</p>
            </div>
            <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
                <p className={`text-xs font-medium capitalize ${statusStyles[pdf.status]}`}>{pdf.status}</p>
                <button onClick={() => onShowLogs(pdf)} className="text-gray-400 hover:text-gray-200"><ClipboardListIcon className="h-4 w-4"/></button>
                {pdf.status === 'completed' && <button onClick={() => onView(pdf.id)} className="text-xs text-primary-500 hover:underline">View</button>}
                <button onClick={() => onDelete(pdf.id)} className="text-gray-400 hover:text-red-500"><XIcon className="h-4 w-4"/></button>
            </div>
        </div>
    );
};