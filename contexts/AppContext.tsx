import React, { createContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import { User, Role, UsageLog, ToastData, UserDataStore, PdfFile, ManuscriptFile, GeneratedReport, AppState } from '../types';
import { USERS, USAGE_LOGS } from '../constants';
import { loadInitialState, STORAGE_KEY } from '../services/migrationService';

interface AppContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  users: User[];
  currentUser: User | null;
  addUser: (email: string, role: Role, tokenCap: number, password: string, status: 'active' | 'inactive') => void;
  deleteUser: (userId: number) => void;
  updateUser: (user: User) => void;
  usageLogs: UsageLog[];
  addUsageLog: (log: Omit<UsageLog, 'id' | 'timestamp' | 'promptTokens' | 'responseTokens'>) => { promptTokens: number, responseTokens: number };
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, 'id'>) => void;
  removeToast: (id: string) => void;
  login: (email: string, password?: string) => boolean;
  logout: () => void;
  
  // User-specific data store and management functions
  currentUserData: UserDataStore | null;
  // Metadata Extractor Actions
  createMetadataFolder: (name: string) => void;
  deleteMetadataFolder: (folderId: string) => void;
  addPdfFilesToFolder: (folderId: string, files: PdfFile[]) => void;
  createMetadataFolderAndAddPdfs: (folderName: string, files: PdfFile[]) => void;
  updatePdfFile: (pdfId: string, updates: Partial<PdfFile>) => void;
  deletePdfFile: (folderId: string, pdfId: string) => void;
  updateMetadataAsset: (pdfId: string, assetId: string, updates: Partial<any>) => void;
  deleteMetadataAsset: (pdfId: string, assetId: string) => void;
  // Compliance Checker Actions
  createComplianceProfile: (name: string) => void;
  deleteComplianceProfile: (profileId: string) => void;
  addRuleFilesToProfile: (profileId: string, newRuleFiles: Record<string, any>) => void;
  deleteRuleFileFromProfile: (profileId: string, ruleFileId: string) => void;
  createComplianceFolder: (name: string, profileId: string | null) => void;
  deleteComplianceFolder: (folderId: string) => void;
  updateComplianceFolderProfile: (folderId: string, profileId: string | null) => void;
  addManuscriptsToFolder: (folderId: string, files: ManuscriptFile[]) => void;
  updateManuscript: (manuscriptId: string, updates: Partial<ManuscriptFile>) => void;
  deleteManuscript: (folderId: string, manuscriptId: string) => void;
  // Report Generation
  addGeneratedReport: (report: Omit<GeneratedReport, 'id' | 'timestamp'>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

const defaultUserData: UserDataStore = {
    metadataFolders: [],
    complianceFolders: [],
    complianceProfiles: [],
    ruleFiles: {},
    generatedReports: [],
};

const defaultAppState: AppState = {
    users: USERS,
    usageLogs: USAGE_LOGS,
    currentUserId: null,
    appData: {
        1: defaultUserData,
        2: defaultUserData,
        3: defaultUserData
    },
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [appState, setAppState] = useState<AppState>(defaultAppState);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialState = loadInitialState();
    setAppState(initialState);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized) {
      const stateToStore = {
        ...appState,
        version: 1
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToStore));
    }
  }, [appState, isInitialized]);

  const currentUser = useMemo(() => {
    if (!appState.currentUserId) return null;
    return appState.users.find(u => u.id === appState.currentUserId) || null;
  }, [appState.currentUserId, appState.users]);

  const toggleTheme = useCallback(() => setTheme(prev => (prev === 'light' ? 'dark' : 'light')), []);
  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => { setToasts(prev => [{ id: Math.random().toString(36).substring(2, 9), ...toast }, ...prev]); }, []);
  const removeToast = useCallback((id: string) => { setToasts(prev => prev.filter(toast => toast.id !== id)); }, []);
  
  const login = useCallback((email: string, password?: string): boolean => {
    const userToLogin = appState.users.find(u => u.email === email);
    if (userToLogin) {
        if (userToLogin.password === password) {
             if (userToLogin.status === 'inactive') {
                addToast({ type: 'error', message: 'This account is inactive.' }); return false;
            }
            const updatedUser = { ...userToLogin, lastLogin: new Date().toISOString() };
            setAppState(prev => ({
                ...prev,
                currentUserId: updatedUser.id,
                users: prev.users.map(u => u.id === updatedUser.id ? updatedUser : u)
            }));
            addToast({ type: 'success', message: `Welcome back, ${email}!` });
            return true;
        } else {
            addToast({ type: 'error', message: 'Invalid password. Please try again.' }); return false;
        }
    } else {
        addToast({ type: 'error', message: `User with email ${email} not found.` }); return false;
    }
  }, [appState.users, addToast]);

  const logout = useCallback(() => {
    addToast({ type: 'info', message: 'You have been logged out.' });
    setAppState(prev => ({ ...prev, currentUserId: null }));
  }, [addToast]);
  
  const addUser = useCallback((email: string, role: Role, tokenCap: number, password: string, status: 'active' | 'inactive') => {
    if (appState.users.some(u => u.email === email)) {
        addToast({ type: 'error', message: `User with email ${email} already exists.` }); return;
    }
    const newUserId = Math.max(0, ...appState.users.map(u => u.id)) + 1;
    const newUser: User = {
        id: newUserId, email, password, role, tokenCap, tokensUsed: 0,
        lastLogin: new Date().toISOString(), status, canUseProModel: role === Role.Admin
    };
    setAppState(prev => ({
        ...prev,
        users: [...prev.users, newUser],
        appData: { ...prev.appData, [newUserId]: { ...defaultUserData } }
    }));
    addToast({type: 'success', message: `User ${email} added successfully.`});
  }, [appState.users, addToast]);

  const deleteUser = useCallback((userId: number) => {
    if (userId === currentUser?.id) { addToast({type: 'error', message: "Cannot delete the currently logged-in user."}); return; }
    setAppState(prev => {
        const newUsers = prev.users.filter(u => u.id !== userId);
        const newAppData = { ...prev.appData };
        delete newAppData[userId];
        return { ...prev, users: newUsers, appData: newAppData };
    });
    addToast({type: 'info', message: `User with ID ${userId} deleted.`});
  }, [currentUser, addToast]);

  const updateUser = useCallback((updatedUser: User) => {
    setAppState(prev => ({
        ...prev,
        users: prev.users.map(u => u.id === updatedUser.id ? {...u, ...updatedUser} : u)
    }));
    addToast({type: 'success', message: `User ${updatedUser.email} updated.`});
  }, [addToast]);
  
  const addUsageLog = useCallback((log: Omit<UsageLog, 'id' | 'timestamp' | 'promptTokens' | 'responseTokens'>): { promptTokens: number, responseTokens: number } => {
    const promptTokens = Math.floor(Math.random() * 3000) + 500;
    const responseTokens = Math.floor(Math.random() * 2000) + 300;
    const totalTokens = promptTokens + responseTokens;
    const newLog: UsageLog = { ...log, id: `log_${Date.now()}`, timestamp: new Date().toISOString(), promptTokens, responseTokens };
    
    setAppState(prev => ({
        ...prev,
        usageLogs: [newLog, ...prev.usageLogs],
        users: prev.users.map(u => (u.id === log.userId ? { ...u, tokensUsed: u.tokensUsed + totalTokens } : u))
    }));
    return { promptTokens, responseTokens };
  }, []);

  const currentUserData = useMemo(() => currentUser ? appState.appData[currentUser.id] || defaultUserData : null, [appState.appData, currentUser]);
  
  const updateCurrentUserStore = useCallback((updater: (store: UserDataStore) => UserDataStore) => {
    setAppState(prev => {
        if (!prev.currentUserId) {
            return prev;
        }
        const currentStore = prev.appData[prev.currentUserId] || defaultUserData;
        const newStore = updater(currentStore);
        return {
            ...prev,
            appData: {
                ...prev.appData,
                [prev.currentUserId]: newStore,
            },
        };
    });
  }, []);

  const createMetadataFolder = useCallback((name: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: [...store.metadataFolders, { id: Date.now().toString(), name, pdfFiles: [] }] })), [updateCurrentUserStore]);
  const deleteMetadataFolder = useCallback((folderId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.filter(f => f.id !== folderId) })), [updateCurrentUserStore]);
  const addPdfFilesToFolder = useCallback((folderId: string, files: PdfFile[]) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => f.id === folderId ? { ...f, pdfFiles: [...f.pdfFiles, ...files] } : f) })), [updateCurrentUserStore]);
  const createMetadataFolderAndAddPdfs = useCallback((folderName: string, files: PdfFile[]) => {
    const newFolder = { id: Date.now().toString(), name: folderName, pdfFiles: files };
    updateCurrentUserStore(store => ({ ...store, metadataFolders: [...store.metadataFolders, newFolder] }));
  }, [updateCurrentUserStore]);
  const updatePdfFile = useCallback((pdfId: string, updates: Partial<PdfFile>) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, ...updates } : p) })) })), [updateCurrentUserStore]);
  const deletePdfFile = useCallback((folderId: string, pdfId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => f.id === folderId ? { ...f, pdfFiles: f.pdfFiles.filter(p => p.id !== pdfId) } : f) })), [updateCurrentUserStore]);
  const updateMetadataAsset = useCallback((pdfId: string, assetId: string, updates: Partial<any>) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, assets: p.assets?.map(a => a.id === assetId ? { ...a, ...updates } : a) } : p) })) })), [updateCurrentUserStore]);
  const deleteMetadataAsset = useCallback((pdfId: string, assetId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, assets: p.assets?.filter(a => a.id !== assetId) } : p) })) })), [updateCurrentUserStore]);

  const createComplianceProfile = useCallback((name: string) => updateCurrentUserStore(store => ({ ...store, complianceProfiles: [...store.complianceProfiles, { id: Date.now().toString(), name, ruleFileIds: [] }] })), [updateCurrentUserStore]);
  const deleteComplianceProfile = useCallback((profileId: string) => updateCurrentUserStore(store => ({ ...store, complianceProfiles: store.complianceProfiles.filter(p => p.id !== profileId) })), [updateCurrentUserStore]);
  const addRuleFilesToProfile = useCallback((profileId: string, newRuleFiles: Record<string, any>) => updateCurrentUserStore(store => ({ ...store, ruleFiles: { ...store.ruleFiles, ...newRuleFiles }, complianceProfiles: store.complianceProfiles.map(p => p.id === profileId ? { ...p, ruleFileIds: [...p.ruleFileIds, ...Object.keys(newRuleFiles)] } : p) })), [updateCurrentUserStore]);
  const deleteRuleFileFromProfile = useCallback((profileId: string, ruleFileId: string) => updateCurrentUserStore(store => ({...store, complianceProfiles: store.complianceProfiles.map(p => p.id === profileId ? { ...p, ruleFileIds: p.ruleFileIds.filter(id => id !== ruleFileId) } : p) })), [updateCurrentUserStore]);
  const createComplianceFolder = useCallback((name: string, profileId: string | null) => updateCurrentUserStore(store => ({ ...store, complianceFolders: [...store.complianceFolders, { id: Date.now().toString(), name, profileId, manuscripts: [] }] })), [updateCurrentUserStore]);
  const deleteComplianceFolder = useCallback((folderId: string) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.filter(f => f.id !== folderId) })), [updateCurrentUserStore]);
  const updateComplianceFolderProfile = useCallback((folderId: string, profileId: string | null) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, profileId } : f) })), [updateCurrentUserStore]);
  const addManuscriptsToFolder = useCallback((folderId: string, files: ManuscriptFile[]) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, manuscripts: [...f.manuscripts, ...files] } : f) })), [updateCurrentUserStore]);
  const updateManuscript = useCallback((manuscriptId: string, updates: Partial<ManuscriptFile>) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => ({ ...f, manuscripts: f.manuscripts.map(m => m.id === manuscriptId ? { ...m, ...updates } : m) })) })), [updateCurrentUserStore]);
  const deleteManuscript = useCallback((folderId: string, manuscriptId: string) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, manuscripts: f.manuscripts.filter(m => m.id !== manuscriptId) } : f) })), [updateCurrentUserStore]);

  const addGeneratedReport = useCallback((report: Omit<GeneratedReport, 'id' | 'timestamp'>) => {
    const newReport: GeneratedReport = { ...report, id: `rep_${Date.now()}`, timestamp: new Date().toISOString() };
    updateCurrentUserStore(store => ({ ...store, generatedReports: [newReport, ...(store.generatedReports || [])] }));
  }, [updateCurrentUserStore]);

  const contextValue = useMemo(() => ({
    theme, toggleTheme,
    users: appState.users,
    usageLogs: appState.usageLogs,
    currentUser,
    addUser, deleteUser, updateUser,
    addUsageLog,
    toasts, addToast, removeToast,
    login, logout,
    currentUserData,
    createMetadataFolder, deleteMetadataFolder, addPdfFilesToFolder, createMetadataFolderAndAddPdfs,
    updatePdfFile, deletePdfFile, updateMetadataAsset, deleteMetadataAsset,
    createComplianceProfile, deleteComplianceProfile, addRuleFilesToProfile,
    deleteRuleFileFromProfile, createComplianceFolder, deleteComplianceFolder,
    updateComplianceFolderProfile, addManuscriptsToFolder, updateManuscript, deleteManuscript,
    addGeneratedReport,
  }), [
    theme, appState, currentUser, currentUserData, toasts,
    toggleTheme, addUser, deleteUser, updateUser, addUsageLog, addToast, removeToast, login, logout,
    createMetadataFolder, deleteMetadataFolder, addPdfFilesToFolder, createMetadataFolderAndAddPdfs,
    updatePdfFile, deletePdfFile, updateMetadataAsset, deleteMetadataAsset,
    createComplianceProfile, deleteComplianceProfile, addRuleFilesToProfile,
    deleteRuleFileFromProfile, createComplianceFolder, deleteComplianceFolder,
    updateComplianceFolderProfile, addManuscriptsToFolder, updateManuscript, deleteManuscript,
    addGeneratedReport
  ]);

  if (!isInitialized) return null; // Or a loading spinner

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};