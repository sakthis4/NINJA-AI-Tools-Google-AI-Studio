import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { ExtractedAsset, BoundingBox, MetadataProjectFolder, PdfFile, PdfFileStatus } from '../types';
import { useAppContext } from '../hooks/useAppContext';
import { extractAssetsFromPage, generateMetadataForCroppedImage } from '../services/aiService';
import Spinner from '../components/Spinner';
import { UploadIcon, ChevronLeftIcon, SparklesIcon, DownloadIcon, TrashIcon, ChevronDownIcon, XIcon, CursorClickIcon, ExclamationIcon, FolderIcon, DocumentTextIcon, PlusCircleIcon, ClipboardListIcon, ShieldCheckIcon, CheckIcon } from '../components/icons/Icons';
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

interface LazyPdfPageProps {
    pdfDoc: pdfjsLib.PDFDocumentProxy;
    pageNum: number;
    scale: number;
    viewerRef: React.RefObject<HTMLDivElement>;
    isZoningMode: boolean;
    onZone: (box: BoundingBox, pageNum: number) => void;
}

const LazyPdfPage: React.FC<LazyPdfPageProps> = ({ pdfDoc, pageNum, scale, viewerRef, isZoningMode, onZone }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isIntersecting, setIsIntersecting] = useState(false);
    const [isRendered, setIsRendered] = useState(false);
    const [drawingBox, setDrawingBox] = useState<{ startX: number, startY: number, endX: number, endY: number} | null>(null);

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
            const canvas = canvasRef.current;
            const viewport = page.getViewport({ scale });
            const context = canvas.getContext('2d');
            if (!context) return;
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            ((page.render as any)({ canvasContext: context, viewport })).promise.then(() => {
                if (!isCancelled) setIsRendered(true);
            });
        });
        return () => { isCancelled = true; };
    }, [isIntersecting, isRendered, pdfDoc, pageNum, scale]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isZoningMode) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        setDrawingBox({ startX, startY, endX: startX, endY: startY });
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!drawingBox) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;
        setDrawingBox({...drawingBox, endX, endY });
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!drawingBox) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const { startX, startY, endX, endY } = drawingBox;
        
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        if (width > 5 && height > 5) { // Threshold to prevent accidental tiny boxes
            onZone({
                x: (x / rect.width) * 100,
                y: (y / rect.height) * 100,
                width: (width / rect.width) * 100,
                height: (height / rect.height) * 100,
            }, pageNum);
        }
        setDrawingBox(null);
    };

    const getBoxStyle = () => {
        if (!drawingBox) return {};
        const { startX, startY, endX, endY } = drawingBox;
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        return {
            left: `${x}px`,
            top: `${y}px`,
            width: `${width}px`,
            height: `${height}px`,
        };
    };

    return (
        <div ref={containerRef} className="absolute inset-0" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
            {isIntersecting && <canvas ref={canvasRef} className={isRendered ? 'block' : 'hidden'} />}
            {drawingBox && <div className="absolute border-2 border-dashed border-red-500 bg-red-500/20" style={getBoxStyle()} />}
            {isIntersecting && !isRendered && (
                <div className="w-full h-full flex items-center justify-center bg-gray-300 dark:bg-gray-600">
                    <Spinner size="md" />
                </div>
            )}
        </div>
    );
};


// --- Editor View Component ---
interface EditorViewProps {
    folder: MetadataProjectFolder;
    pdfFile: PdfFile;
    onBack: () => void;
    onAssetAdd: (newAsset: ExtractedAsset) => void;
    onAssetUpdate: (assetId: string, field: keyof ExtractedAsset, value: any) => void;
    onAssetDelete: (assetId: string) => void;
    onRegenerate: (assetId: string, modelName: string) => void;
    onExport: (pdfFile: PdfFile) => void;
    model: string;
}

const EditorView: React.FC<EditorViewProps> = ({ folder, pdfFile, onBack, onAssetAdd, onAssetUpdate, onAssetDelete, onRegenerate, onExport, model }) => {
    const { addUsageLog, setStatusBarMessage, currentUser } = useAppContext();
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
    const [pdfScale, setPdfScale] = useState(0);
    const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number; }[]>([]);
    const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
    const viewerRef = useRef<HTMLDivElement>(null);
    const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [isZoningMode, setIsZoningMode] = useState(false);
    const [newZone, setNewZone] = useState<{ box: BoundingBox, pageNum: number} | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const selectedAsset = useMemo(() => 
        pdfFile.assets?.find(a => a.id === selectedAssetId),
        [selectedAssetId, pdfFile.assets]
    );

    const updatePdfDimensions = useCallback(async (pdf: pdfjsLib.PDFDocumentProxy) => {
        if (!viewerRef.current) return;
        await new Promise<void>(resolve => setTimeout(() => resolve(undefined), 0));
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
                const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
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
        if (selectedAsset) {
            // Ensure we have all the necessary elements and data to perform the scroll
            if (selectedAsset.pageNumber && selectedAsset.boundingBox && viewerRef.current) {
                const pageElement = pageRefs.current[selectedAsset.pageNumber - 1];
                if (pageElement) {
                    const container = viewerRef.current;
                    // BoundingBox.y is a percentage from the top of the page.
                    // Calculate the asset's top position in pixels, relative to the top of its page element.
                    const assetTopInPage = (pageElement.clientHeight * selectedAsset.boundingBox.y) / 100;
                    
                    // The target scroll position is the top of the page element plus the asset's position within the page.
                    // A small margin is subtracted to position the asset slightly below the top of the viewport for better visibility.
                    const margin = 20; // 20px margin from the top of the viewer
                    const targetScrollTop = pageElement.offsetTop + assetTopInPage - margin;

                    container.scrollTo({
                        // Ensure scroll position is not negative
                        top: Math.max(0, targetScrollTop),
                        behavior: 'smooth'
                    });
                }
            } else if (selectedAsset.pageNumber) {
                // Fallback for assets without a bounding box, just scroll the page into view
                pageRefs.current[selectedAsset.pageNumber - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [selectedAsset, pageDimensions]);

    const handleZoneCreated = (box: BoundingBox, pageNum: number) => {
        setNewZone({ box, pageNum });
        setIsZoningMode(false);
    };

    const handleManualAssetGeneration = async () => {
        if (!newZone || !pdfDoc || !currentUser) return;
        setIsGenerating(true);
        setStatusBarMessage(`Generating metadata for new asset...`, 'info');
        try {
            const { box, pageNum } = newZone;
            const page = await pdfDoc.getPage(pageNum);
            const scale = 2.5; // Use a higher resolution for cropping
            const viewport = page.getViewport({ scale });
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = viewport.width; tempCanvas.height = viewport.height;
            const context = tempCanvas.getContext('2d');
            if (!context) throw new Error("Could not get canvas context");

            await (page.render as any)({ canvasContext: context, viewport }).promise;

            const sx = (box.x / 100) * tempCanvas.width;
            const sy = (box.y / 100) * tempCanvas.height;
            const sWidth = (box.width / 100) * tempCanvas.width;
            const sHeight = (box.height / 100) * tempCanvas.height;

            const croppedCanvas = document.createElement('canvas');
            croppedCanvas.width = sWidth; croppedCanvas.height = sHeight;
            const croppedContext = croppedCanvas.getContext('2d');
            if (!croppedContext) throw new Error("Could not get cropped canvas context");
            croppedContext.drawImage(tempCanvas, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

            const imageDataUrl = croppedCanvas.toDataURL('image/png');
            const newMetadata = await generateMetadataForCroppedImage(imageDataUrl, model);

            const newAsset: ExtractedAsset = {
                ...newMetadata,
                id: `${performance.now()}-${Math.random().toString(36).substring(2, 9)}`,
                pageNumber: pageNum,
                boundingBox: box,
                preview: newMetadata.preview || "Manually added asset",
            };
            
            onAssetAdd(newAsset);
            addUsageLog({ 
                userId: currentUser.id, 
                toolName: 'PDF Asset Analyzer (Manual Add)', 
                modelName: model,
                outputId: pdfFile.id,
                outputName: `${pdfFile.name} (Asset: ${newAsset.assetId})`,
            });
            setStatusBarMessage(`Successfully added new asset: ${newAsset.assetId}`, 'success');

        } catch (error) {
            setStatusBarMessage(`Failed to generate metadata: ${error instanceof Error ? error.message : "Unknown error"}`, 'error');
        } finally {
            setIsGenerating(false);
            setNewZone(null);
        }
    };
    
    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                 <div className="flex items-center">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3">
                        <ChevronLeftIcon className="h-5 w-5" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white truncate" title={pdfFile.name}>{pdfFile.name}</h2>
                        <p className="text-sm text-gray-500">Folder: {folder.name}</p>
                    </div>
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-hidden">
                <div ref={viewerRef} className={`relative overflow-y-auto bg-gray-200 dark:bg-gray-700 p-2 md:p-4 rounded-lg shadow-inner ${isZoningMode ? 'cursor-crosshair' : ''}`}>
                    {pdfDoc && pageDimensions.length > 0 ? pageDimensions.map((dim, index) => (
                        <div key={`page_${index + 1}`} ref={el => { pageRefs.current[index] = el; }} data-page-index={index}
                             className="relative shadow-lg mb-4 bg-white dark:bg-gray-800 mx-auto"
                             style={{ width: dim.width, height: dim.height }}>
                            
                            <LazyPdfPage pdfDoc={pdfDoc} pageNum={index + 1} scale={pdfScale} viewerRef={viewerRef} isZoningMode={isZoningMode} onZone={handleZoneCreated}/>
                            
                            {/* Highlight box for selected asset removed as per user request */}
                            
                            {newZone && newZone.pageNum === index + 1 && (
                                <div className="absolute border-2 border-green-500 bg-green-500/20 pointer-events-none" style={{ left: `${newZone.box.x}%`, top: `${newZone.box.y}%`, width: `${newZone.box.width}%`, height: `${newZone.box.height}%` }}>
                                    <div className="absolute -top-10 right-0 flex items-center space-x-1 pointer-events-auto">
                                        <button onClick={() => setNewZone(null)} className="p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"><XIcon className="h-4 w-4" /></button>
                                        <button onClick={handleManualAssetGeneration} disabled={isGenerating} className="p-1.5 bg-green-600 text-white rounded-full hover:bg-green-700 shadow-lg disabled:bg-gray-400">
                                            {isGenerating ? <Spinner size="sm"/> : <CheckIcon className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )) : (
                         <div className="flex flex-col items-center justify-center h-full text-center text-gray-600 dark:text-gray-400">
                             <DocumentTextIcon className="h-24 w-24 opacity-50"/>
                            <p className="mt-4 font-semibold">PDF preview not available</p>
                            <p className="text-sm">Original file was not found in this session.</p>
                        </div>
                    )}
                </div>
                 <div className="flex flex-col h-full overflow-hidden">
                     <div className="bg-white dark:bg-gray-800 p-2 md:p-4 rounded-lg shadow-md mb-4 flex-shrink-0">
                         <div className="flex justify-between items-center">
                            <h3 className="text-base md:text-lg font-semibold">Extracted Assets ({pdfFile.assets?.length || 0})</h3>
                            <div className="flex items-center space-x-2">
                                <button onClick={() => setIsZoningMode(!isZoningMode)} className={`px-2 py-1.5 text-xs md:text-sm text-white rounded-md inline-flex items-center transition-colors ${isZoningMode ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-500 hover:bg-primary-600'}`}>
                                    {isZoningMode ? <XIcon className="h-4 w-4 mr-1"/> : <CursorClickIcon className="h-4 w-4 mr-1"/>}
                                    {isZoningMode ? 'Cancel' : 'Add Asset'}
                                </button>
                                <button onClick={() => onExport(pdfFile)} className="px-2 py-1.5 text-xs md:text-sm bg-green-500 text-white rounded-md hover:bg-green-600 inline-flex items-center"><DownloadIcon className="h-4 w-4 mr-1"/>Export CSV</button>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3 pb-4 flex-grow overflow-y-auto pr-2">
                        {pdfFile.assets && sortAssets([...pdfFile.assets]).map(asset => {
                             const isSelected = selectedAssetId === asset.id;
                             return (
                                <div key={asset.id} className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border ${isSelected ? 'border-primary-500 ring-2 ring-primary-500/50' : 'border-transparent'}`}>
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
                                                    <button onClick={() => onRegenerate(asset.id, model)} className="p-1 text-xs text-primary-600 dark:text-primary-400 hover:underline inline-flex items-center">
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
export const MetadataExtractor = ({ onBack }: { onBack: () => void }) => {
    const { currentUser, addUsageLog, setStatusBarMessage, currentUserData, createMetadataFolder, deleteMetadataFolder, addPdfFilesToFolder, updatePdfFile, deletePdfFile, addMetadataAsset, updateMetadataAsset, deleteMetadataAsset, createMetadataFolderAndAddPdfs } = useAppContext();
    const folders = currentUserData?.metadataFolders || [];

    const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
    const [currentPdf, setCurrentPdf] = useState<{ folderId: string, pdfId: string } | null>(null);
    const transientFiles = useRef<Map<string, File>>(new Map());
    const [processingQueue, setProcessingQueue] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [createFolderModalOpen, setCreateFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [logModalState, setLogModalState] = useState({ isOpen: false, logs: [] as string[], fileName: '' });
    const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(true);

    const handleInitialDrop = useCallback((acceptedFiles: File[]) => {
        const newPdfFiles: PdfFile[] = acceptedFiles.map(file => {
            const id = `${performance.now()}-${file.name}`;
            transientFiles.current.set(id, file);
            return { id, name: file.name, status: 'queued', logs: [], progress: 0 };
        });
        createMetadataFolderAndAddPdfs("Default Project", newPdfFiles);
        setProcessingQueue(prev => [...prev, ...newPdfFiles.map(m => m.id)]);
        setStatusBarMessage(`${newPdfFiles.length} file(s) added to a new project.`, 'info');
    }, [createMetadataFolderAndAddPdfs, setStatusBarMessage]);

    const { getRootProps: getInitialRootProps, getInputProps: getInitialInputProps, isDragActive: isInitialDragActive } = useDropzone({
        onDrop: handleInitialDrop,
        accept: { 'application/pdf': ['.pdf'] }
    });

    const addLog = useCallback((pdfId: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = `[${timestamp}] ${message}`;
        const pdf = folders.flatMap(f => f.pdfFiles).find(p => p.id === pdfId);
        if (pdf) {
            updatePdfFile(pdfId, { logs: [...(pdf.logs || []), formattedMessage] });
        }
    }, [folders, updatePdfFile]);
    
    const onDrop = useCallback((acceptedFiles: File[], folderId: string) => {
        const newPdfFiles: PdfFile[] = acceptedFiles.map(file => {
            const id = `${performance.now()}-${file.name}`;
            transientFiles.current.set(id, file);
            return { id, name: file.name, status: 'queued', logs: [], progress: 0 };
        });
        addPdfFilesToFolder(folderId, newPdfFiles);
        setProcessingQueue(prev => [...prev, ...newPdfFiles.map(m => m.id)]);
        setStatusBarMessage(`${newPdfFiles.length} file(s) added to queue.`, 'info');
    }, [addPdfFilesToFolder, setStatusBarMessage]);

    useEffect(() => {
        const processNextInQueue = async () => {
            if (isProcessing || processingQueue.length === 0) return;
            setIsProcessing(true);
            const pdfId = processingQueue[0];
            const pdfFile = folders.flatMap(f => f.pdfFiles).find(p => p.id === pdfId);
            const fileObject = transientFiles.current.get(pdfId);

            if (!pdfFile || !fileObject) {
                addLog(pdfId, "ERROR: File object not found for processing.");
                updatePdfFile(pdfId, { status: 'error', logs: [...(pdfFile?.logs || []), `[ERROR] File not found.`] });
                setIsProcessing(false); setProcessingQueue(q => q.slice(1)); return;
            }

            addLog(pdfId, `Starting processing for ${fileObject.name}.`);
            updatePdfFile(pdfId, { status: 'processing', progress: 0 });
            let hasErrors = false;

            try {
                addLog(pdfId, `Loading PDF...`);
                const fileBuffer = await fileObject.arrayBuffer();
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise;
                let allAssets: ExtractedAsset[] = [];
                addLog(pdfId, `PDF has ${pdf.numPages} pages. Beginning asset extraction.`);

                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                     try {
                        const progress = Math.round((pageNum / pdf.numPages) * 100);
                        updatePdfFile(pdfId, { progress });
                        addLog(pdfId, `Processing page ${pageNum}/${pdf.numPages}...`);
                        
                        const page = await pdf.getPage(pageNum);
                        const viewport = page.getViewport({ scale: 1.5 });
                        const canvas = document.createElement('canvas');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;
                        const context = canvas.getContext('2d');
                        if (!context) throw new Error("Canvas 2D context not available");
                        await (page.render as any)({ canvasContext: context, viewport }).promise;
                        const pageImageBase64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                        
                        const assetsOnPage = await extractAssetsFromPage(pageImageBase64, selectedModel);
                        if (assetsOnPage.length > 0) {
                            addLog(pdfId, `Found ${assetsOnPage.length} asset(s) on page ${pageNum}.`);
                            allAssets = [...allAssets, ...assetsOnPage.map(asset => ({...asset, id: `${performance.now()}-${Math.random().toString(36).substring(2, 9)}`, pageNumber: pageNum}))];
                        }
                        if (pageNum < pdf.numPages) await new Promise<void>(resolve => setTimeout(() => resolve(undefined), 1100));
                    } catch (pageError) {
                        hasErrors = true;
                        const errorMessage = pageError instanceof Error ? pageError.message : "Unknown error during page processing.";
                        addLog(pdfId, `ERROR on page ${pageNum}: ${errorMessage}`);
                    }
                }
                
                updatePdfFile(pdfId, { status: hasErrors ? 'error' : 'completed', assets: allAssets, progress: 100 });
                addLog(pdfId, `Processing finished ${hasErrors ? 'with errors' : 'successfully'}.`);
                addUsageLog({ 
                    userId: currentUser!.id, 
                    toolName: 'PDF Asset Analyzer', 
                    modelName: selectedModel,
                    outputId: pdfId,
                    outputName: fileObject.name,
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Fatal processing failed";
                addLog(pdfId, `FATAL ERROR: ${errorMessage}`);
                updatePdfFile(pdfId, { status: 'error' });
            } finally {
                setIsProcessing(false);
                setProcessingQueue(q => q.slice(1));
            }
        };
        processNextInQueue();
    }, [processingQueue, isProcessing, folders, addUsageLog, currentUser, addLog, updatePdfFile, selectedModel]);

    const handleRegenerateAsset = async (pdfId: string, assetId: string, modelName: string) => {
        const pdfFile = folders.flatMap(f => f.pdfFiles).find(p => p.id === pdfId);
        const asset = pdfFile?.assets?.find(a => a.id === assetId);
        const fileObject = transientFiles.current.get(pdfId);

        if (!pdfFile || !asset || !asset.pageNumber || !asset.boundingBox || !fileObject) {
            setStatusBarMessage("Could not find asset or required data to regenerate.", 'error'); return;
        }

        setStatusBarMessage(`Regenerating metadata for ${asset.assetId}...`, 'info');
        try {
            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(await fileObject.arrayBuffer()) }).promise;
            const page = await pdfDoc.getPage(asset.pageNumber);
            const scale = 2;
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width; canvas.height = viewport.height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error("Could not get canvas context");
            await (page.render as any)({ canvasContext: context, viewport }).promise;

            const { x, y, width, height } = asset.boundingBox;
            const croppedCanvas = document.createElement('canvas');
            const sx = (x / 100) * canvas.width; const sy = (y / 100) * canvas.height;
            const sWidth = (width / 100) * canvas.width; const sHeight = (height / 100) * canvas.height;
            croppedCanvas.width = sWidth; croppedCanvas.height = sHeight;
            const croppedContext = croppedCanvas.getContext('2d');
            if (!croppedContext) throw new Error("Could not get cropped canvas context");
            croppedContext.drawImage(canvas, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

            const imageDataUrl = croppedCanvas.toDataURL('image/png');
            const newMetadata = await generateMetadataForCroppedImage(imageDataUrl, modelName);
            
            updateMetadataAsset(pdfId, assetId, { ...newMetadata, assetId: newMetadata.assetId || asset.assetId });

            setStatusBarMessage(`Successfully regenerated metadata for ${asset.assetId}.`, 'success');
            addUsageLog({ 
                userId: currentUser!.id, 
                toolName: 'PDF Asset Analyzer (Regen)', 
                modelName: modelName,
                outputId: pdfId,
                outputName: `${fileObject.name} (Asset: ${asset.assetId})`,
            });
        } catch (error) {
            console.error("Regeneration failed:", error);
            setStatusBarMessage(`Regeneration failed: ${error instanceof Error ? error.message : "Unknown"}`, 'error');
        }
    };

    const handleExport = (pdfFile: PdfFile) => {
        const fileName = `${pdfFile.name}_metadata.csv`;
        let csvContent = "Filename,Asset ID,Asset Type,Page/Location,Alt Text,Keywords,Taxonomy\n";
        (pdfFile.assets || []).forEach(asset => {
            const row = [
                pdfFile.name,
                asset.assetId,
                asset.assetType,
                asset.pageNumber,
                `"${(asset.altText || '').replace(/"/g, '""')}"`,
                `"${(asset.keywords || []).join(', ').replace(/"/g, '""')}"`,
                `"${(asset.taxonomy || '').replace(/"/g, '""')}"`
            ].join(',');
            csvContent += row + "\r\n";
        });

        const link = document.createElement("a");
        link.setAttribute("href", 'data:text/csv;charset=utf-8,' + encodeURI(csvContent));
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setStatusBarMessage(`Exported ${fileName}`, 'success');
    };

    if (view === 'editor' && currentPdf) {
        const folder = folders.find(f => f.id === currentPdf.folderId);
        const pdfFile = folder?.pdfFiles.find(p => p.id === currentPdf.pdfId);
        if (folder && pdfFile) {
            if (!pdfFile.file) pdfFile.file = transientFiles.current.get(pdfFile.id);
            return <EditorView 
                folder={folder} pdfFile={pdfFile} onBack={() => setView('dashboard')}
                onAssetAdd={(newAsset) => addMetadataAsset(pdfFile.id, newAsset)}
                onAssetUpdate={(assetId, field, value) => updateMetadataAsset(pdfFile.id, assetId, { [field]: value })}
                onAssetDelete={(assetId) => deleteMetadataAsset(pdfFile.id, assetId)}
                onRegenerate={(assetId, modelName) => handleRegenerateAsset(pdfFile.id, assetId, modelName)} onExport={handleExport}
                model={selectedModel}
            />;
        }
    }

    return (
        <div className="animate-fade-in h-full flex flex-col p-4 md:p-6 lg:p-8 bg-gray-100 dark:bg-gray-900">
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 mr-3"><ChevronLeftIcon className="h-5 w-5" /></button>
                    <div>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}>
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">PDF Asset Analyzer</h2>
                            <ChevronDownIcon className={`h-5 w-5 text-gray-500 transition-transform duration-300 ${isHeaderExpanded ? 'rotate-180' : ''}`} />
                        </div>
                        {isHeaderExpanded && (
                            <p className="text-sm text-gray-500 mt-1 animate-fade-in origin-top">
                                Analyzes PDF documents to generate accessible metadata like alt text, keywords, and taxonomy for all figures, tables, and images.
                            </p>
                        )}
                    </div>
                </div>
                 <div className="flex items-center gap-4">
                    <button onClick={() => setCreateFolderModalOpen(true)} className="flex items-center px-3 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 shadow"><PlusCircleIcon className="h-5 w-5 mr-2"/>New Folder</button>
                </div>
            </div>
            <div className="flex-grow overflow-y-auto space-y-6">
                {folders.length === 0 ? (
                    <div {...getInitialRootProps()} className={`h-full flex flex-col items-center justify-center text-center p-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isInitialDragActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'}`}>
                        <input {...getInitialInputProps()} />
                        <UploadIcon className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Start your first project</h3>
                        <p className="text-gray-500">Drag & drop a PDF here, or click to select one.</p>
                        <div className="mt-4 flex items-center text-xs text-gray-500">
                            <ShieldCheckIcon className="h-4 w-4 mr-1.5 text-green-500"/>
                            <span>Your files are processed securely.</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">A "Default Project" folder will be created for you automatically.</p>
                    </div>
                ) : (
                    folders.map(folder => <FolderCard key={folder.id} folder={folder} onDrop={onDrop} onView={(pdfId) => { setCurrentPdf({ folderId: folder.id, pdfId }); setView('editor');}} onDeletePdf={(pdfId) => deletePdfFile(folder.id, pdfId)} onDeleteFolder={() => deleteMetadataFolder(folder.id)} onShowLogs={(pdf) => setLogModalState({isOpen: true, logs: pdf.logs || [], fileName: pdf.name})} />)
                )}
            </div>
             <Modal isOpen={createFolderModalOpen} onClose={() => setCreateFolderModalOpen(false)} title="Create New Folder">
                <form onSubmit={(e) => { e.preventDefault(); if (newFolderName.trim()) createMetadataFolder(newFolderName.trim()); setNewFolderName(''); setCreateFolderModalOpen(false); }} className="space-y-4">
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
};

const FolderCard: React.FC<{ folder: MetadataProjectFolder, onDrop: (files: File[], folderId: string) => void, onView: (pdfId: string) => void, onDeletePdf: (pdfId: string) => void, onDeleteFolder: () => void, onShowLogs: (pdf: PdfFile) => void }> = ({ folder, onDrop, onView, onDeletePdf, onDeleteFolder, onShowLogs }) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: (files) => onDrop(files, folder.id), accept: { 'application/pdf': ['.pdf'] }, noClick: true });
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden">
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3"> <FolderIcon className="h-6 w-6 text-primary-500" /> <h3 className="font-bold text-lg">{folder.name}</h3> </div>
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
                <div className="flex items-center justify-center mt-2 text-xs text-gray-500">
                    <ShieldCheckIcon className="h-4 w-4 mr-1.5 text-green-500"/>
                    <span>Your files are processed securely.</span>
                </div>
            </div>
        </div>
    );
};

const PdfFileRow: React.FC<{ pdf: PdfFile, onView: (pdfId: string) => void, onDelete: (pdfId: string) => void, onShowLogs: (pdf: PdfFile) => void }> = ({ pdf, onView, onDelete, onShowLogs }) => {
    const statusStyles = { queued: 'text-gray-500', processing: 'text-blue-500', completed: 'text-green-500', error: 'text-red-500' };
    return (
         <div className="bg-gray-100 dark:bg-gray-900/50 p-2 rounded-md">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 overflow-hidden">
                    <DocumentTextIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                    <p className="text-sm truncate flex-1">{pdf.name}</p>
                </div>
                <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
                    <p className={`text-xs font-medium capitalize ${statusStyles[pdf.status]}`}>{pdf.status}</p>
                    <button onClick={() => onShowLogs(pdf)} className="text-gray-400 hover:text-gray-200" title="View Logs"><ClipboardListIcon className="h-4 w-4"/></button>
                    {pdf.status === 'completed' && <button onClick={() => onView(pdf.id)} className="text-xs text-primary-500 hover:underline">View</button>}
                    <button onClick={() => onDelete(pdf.id)} className="text-gray-400 hover:text-red-500"><XIcon className="h-4 w-4"/></button>
                </div>
            </div>
            {pdf.status === 'processing' && (
                 <div className="mt-2">
                    <div className="w-full bg-gray-300 dark:bg-gray-700 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pdf.progress || 0}%` }}></div>
                    </div>
                </div>
            )}
        </div>
    );
};