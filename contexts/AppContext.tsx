import React, { createContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
// Fix: Import ManuscriptFile type
import { User, Role, UsageLog, ToastData, UserDataStore, MetadataProjectFolder, PdfFile, ProjectFolder, ComplianceProfile, RuleFile, ManuscriptFile, GeneratedReport } from '../types';
import { USERS, USAGE_LOGS } from '../constants';

// The new shape of the context, including the user data store and its management functions.
interface AppContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  users: User[];
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
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
  updatePdfFile: (pdfId: string, updates: Partial<PdfFile>) => void;
  deletePdfFile: (folderId: string, pdfId: string) => void;
  updateMetadataAsset: (pdfId: string, assetId: string, updates: Partial<any>) => void;
  deleteMetadataAsset: (pdfId: string, assetId: string) => void;
  // Compliance Checker Actions
  createComplianceProfile: (name: string) => void;
  deleteComplianceProfile: (profileId: string) => void;
  addRuleFilesToProfile: (profileId: string, newRuleFiles: Record<string, RuleFile>) => void;
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

const getStoredValue = <T,>(key: string, initialValue: T): T => {
    try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
    } catch (error) {
        console.error(`Error reading localStorage key “${key}”:`, error);
        return initialValue;
    }
};

const defaultUserData: UserDataStore = {
    metadataFolders: [],
    complianceFolders: [],
    complianceProfiles: [],
    ruleFiles: {},
    generatedReports: [], // Initialize reports
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [users, setUsers] = useState<User[]>(() => getStoredValue('app_users', USERS));
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>(() => getStoredValue('app_usage_logs', USAGE_LOGS));
  const [currentUser, setCurrentUser] = useState<User | null>(() => getStoredValue('app_current_user', null));
  const [toasts, setToasts] = useState<ToastData[]>([]);
  
  // The master data store for all user-specific data.
  const [appData, setAppData] = useState<Record<number, UserDataStore>>(() => getStoredValue('app_data_store', {}));

  // Persist core app state
  useEffect(() => { window.localStorage.setItem('app_users', JSON.stringify(users)); }, [users]);
  useEffect(() => { window.localStorage.setItem('app_usage_logs', JSON.stringify(usageLogs)); }, [usageLogs]);
  useEffect(() => { window.localStorage.setItem('app_data_store', JSON.stringify(appData)); }, [appData]);
  useEffect(() => {
      if (currentUser) {
          window.localStorage.setItem('app_current_user', JSON.stringify(currentUser));
      } else {
          window.localStorage.removeItem('app_current_user');
      }
  }, [currentUser]);

  const toggleTheme = useCallback(() => setTheme(prev => (prev === 'light' ? 'dark' : 'light')), []);
  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => { setToasts(prev => [{ id: Math.random().toString(36).substring(2, 9), ...toast }, ...prev]); }, []);
  const removeToast = useCallback((id: string) => { setToasts(prev => prev.filter(toast => toast.id !== id)); }, []);
  
  const login = useCallback((email: string, password?: string): boolean => {
    const userToLogin = users.find(u => u.email === email);
    if (userToLogin) {
        if (userToLogin.password === password) {
             if (userToLogin.status === 'inactive') {
                addToast({ type: 'error', message: 'This account is inactive.' }); return false;
            }
            const updatedUser = { ...userToLogin, lastLogin: new Date().toISOString() };
            setCurrentUser(updatedUser);
            setUsers(prevUsers => prevUsers.map(u => (u.id === updatedUser.id ? updatedUser : u)));
            addToast({ type: 'success', message: `Welcome back, ${email}!` });
            return true;
        } else {
            addToast({ type: 'error', message: 'Invalid password. Please try again.' }); return false;
        }
    } else {
        addToast({ type: 'error', message: `User with email ${email} not found.` }); return false;
    }
  }, [users, addToast]);

  const logout = useCallback(() => {
    addToast({ type: 'info', message: 'You have been logged out.' });
    setCurrentUser(null);
  }, [addToast]);
  
  const addUser = useCallback((email: string, role: Role, tokenCap: number, password: string, status: 'active' | 'inactive') => {
    if (users.some(u => u.email === email)) {
        addToast({ type: 'error', message: `User with email ${email} already exists.` }); return;
    }
    const newUserId = Math.max(0, ...users.map(u => u.id)) + 1;
    const newUser: User = {
        id: newUserId, email, password, role, tokenCap, tokensUsed: 0,
        lastLogin: new Date().toISOString(), status, canUseProModel: role === Role.Admin
    };
    setUsers(prev => [...prev, newUser]);
    // Initialize the data store for the new user
    setAppData(prev => ({ ...prev, [newUserId]: { ...defaultUserData } }));
    addToast({type: 'success', message: `User ${email} added successfully.`});
  }, [users, addToast]);

  const deleteUser = useCallback((userId: number) => {
    if (userId === currentUser?.id) { addToast({type: 'error', message: "Cannot delete the currently logged-in user."}); return; }
    setUsers(prev => prev.filter(u => u.id !== userId));
    // Remove the user's data from the store
    setAppData(prev => { const newState = {...prev}; delete newState[userId]; return newState; });
    addToast({type: 'info', message: `User with ID ${userId} deleted.`});
  }, [currentUser, addToast]);

  const updateUser = useCallback((updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? {...u, ...updatedUser} : u));
    setCurrentUser(current => (current?.id === updatedUser.id ? {...current, ...updatedUser} : current));
    addToast({type: 'success', message: `User ${updatedUser.email} updated.`});
  }, [addToast]);
  
  const addUsageLog = useCallback((log: Omit<UsageLog, 'id' | 'timestamp' | 'promptTokens' | 'responseTokens'>): { promptTokens: number, responseTokens: number } => {
    const promptTokens = Math.floor(Math.random() * 3000) + 500;
    const responseTokens = Math.floor(Math.random() * 2000) + 300;
    const totalTokens = promptTokens + responseTokens;
    const newLog: UsageLog = { ...log, id: `log_${Date.now()}`, timestamp: new Date().toISOString(), promptTokens, responseTokens };
    setUsageLogs(prev => [newLog, ...prev]);
    const updateUserWithTokens = (user: User) => ({ ...user, tokensUsed: user.tokensUsed + totalTokens });
    setUsers(prev => prev.map(u => (u.id === log.userId ? updateUserWithTokens(u) : u)));
    setCurrentUser(prev => prev?.id === log.userId ? updateUserWithTokens(prev) : prev);
    return { promptTokens, responseTokens };
  }, []);

  // --- User-Specific Data Management ---
  const currentUserData = useMemo(() => currentUser ? appData[currentUser.id] || defaultUserData : null, [appData, currentUser]);
  
  const updateCurrentUserStore = (updater: (store: UserDataStore) => UserDataStore) => {
      if (!currentUser) return;
      setAppData(prev => ({
          ...prev,
          [currentUser.id]: updater(prev[currentUser.id] || defaultUserData),
      }));
  };

  // Metadata Extractor Actions
  const createMetadataFolder = (name: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: [...store.metadataFolders, { id: Date.now().toString(), name, pdfFiles: [] }] }));
  const deleteMetadataFolder = (folderId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.filter(f => f.id !== folderId) }));
  const addPdfFilesToFolder = (folderId: string, files: PdfFile[]) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => f.id === folderId ? { ...f, pdfFiles: [...f.pdfFiles, ...files] } : f) }));
  const updatePdfFile = (pdfId: string, updates: Partial<PdfFile>) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, ...updates } : p) })) }));
  const deletePdfFile = (folderId: string, pdfId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => f.id === folderId ? { ...f, pdfFiles: f.pdfFiles.filter(p => p.id !== pdfId) } : f) }));
  const updateMetadataAsset = (pdfId: string, assetId: string, updates: Partial<any>) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, assets: p.assets?.map(a => a.id === assetId ? { ...a, ...updates } : a) } : p) })) }));
  const deleteMetadataAsset = (pdfId: string, assetId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, assets: p.assets?.filter(a => a.id !== assetId) } : p) })) }));

  // Compliance Checker Actions
  const createComplianceProfile = (name: string) => updateCurrentUserStore(store => ({ ...store, complianceProfiles: [...store.complianceProfiles, { id: Date.now().toString(), name, ruleFileIds: [] }] }));
  const deleteComplianceProfile = (profileId: string) => updateCurrentUserStore(store => ({ ...store, complianceProfiles: store.complianceProfiles.filter(p => p.id !== profileId) }));
  const addRuleFilesToProfile = (profileId: string, newRuleFiles: Record<string, RuleFile>) => updateCurrentUserStore(store => ({ ...store, ruleFiles: { ...store.ruleFiles, ...newRuleFiles }, complianceProfiles: store.complianceProfiles.map(p => p.id === profileId ? { ...p, ruleFileIds: [...p.ruleFileIds, ...Object.keys(newRuleFiles)] } : p) }));
  const deleteRuleFileFromProfile = (profileId: string, ruleFileId: string) => updateCurrentUserStore(store => ({...store, complianceProfiles: store.complianceProfiles.map(p => p.id === profileId ? { ...p, ruleFileIds: p.ruleFileIds.filter(id => id !== ruleFileId) } : p) }));
  const createComplianceFolder = (name: string, profileId: string | null) => updateCurrentUserStore(store => ({ ...store, complianceFolders: [...store.complianceFolders, { id: Date.now().toString(), name, profileId, manuscripts: [] }] }));
  const deleteComplianceFolder = (folderId: string) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.filter(f => f.id !== folderId) }));
  const updateComplianceFolderProfile = (folderId: string, profileId: string | null) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, profileId } : f) }));
  const addManuscriptsToFolder = (folderId: string, files: ManuscriptFile[]) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, manuscripts: [...f.manuscripts, ...files] } : f) }));
  const updateManuscript = (manuscriptId: string, updates: Partial<ManuscriptFile>) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => ({ ...f, manuscripts: f.manuscripts.map(m => m.id === manuscriptId ? { ...m, ...updates } : m) })) }));
  const deleteManuscript = (folderId: string, manuscriptId: string) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, manuscripts: f.manuscripts.filter(m => m.id !== manuscriptId) } : f) }));

  // Report Generation
  const addGeneratedReport = (report: Omit<GeneratedReport, 'id' | 'timestamp'>) => {
    const newReport: GeneratedReport = {
      ...report,
      id: `rep_${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    updateCurrentUserStore(store => ({
      ...store,
      generatedReports: [newReport, ...(store.generatedReports || [])],
    }));
  };

  const contextValue = useMemo(() => ({
    theme, toggleTheme, users, currentUser, setCurrentUser, addUser, deleteUser, updateUser, usageLogs,
    addUsageLog, toasts, addToast, removeToast, login, logout, currentUserData, createMetadataFolder,
    deleteMetadataFolder, addPdfFilesToFolder, updatePdfFile, deletePdfFile, updateMetadataAsset,
    deleteMetadataAsset, createComplianceProfile, deleteComplianceProfile, addRuleFilesToProfile,
    deleteRuleFileFromProfile, createComplianceFolder, deleteComplianceFolder, updateComplianceFolderProfile,
    addManuscriptsToFolder, updateManuscript, deleteManuscript, addGeneratedReport,
  }), [
    theme, users, currentUser, usageLogs, toasts, appData,
    toggleTheme, addUser, deleteUser, updateUser, addUsageLog, addToast, removeToast, login, logout
  ]);

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};