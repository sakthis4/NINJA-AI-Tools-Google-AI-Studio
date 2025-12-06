import React, { createContext, useReducer, ReactNode, useCallback, useMemo, useEffect } from 'react';
import { User, Role, UsageLog, UserDataStore, PdfFile, ManuscriptFile, AppState, StatusBarMessage, ExtractedAsset, AnalysisProjectFolder, BookFile } from '../types';
import { USERS, USAGE_LOGS } from '../constants';
import { loadInitialState, STORAGE_KEY } from '../services/migrationService';

interface AppContextType {
  theme: 'light' | 'dark';
  // FIX: Corrected the function type syntax from 'to' to '=>'.
  toggleTheme: () => void;
  users: User[];
  currentUser: User | null;
  addUser: (email: string, role: Role, tokenCap: number, password: string, status: 'active' | 'inactive') => void;
  deleteUser: (userId: number) => void;
  updateUser: (user: User) => void;
  usageLogs: UsageLog[];
  addUsageLog: (log: Omit<UsageLog, 'id' | 'timestamp' | 'promptTokens' | 'responseTokens'>) => { promptTokens: number, responseTokens: number };
  statusBarMessage: StatusBarMessage | null;
  setStatusBarMessage: (message: string, type: 'success' | 'error' | 'info') => void;
  login: (email: string, password?: string) => boolean;
  logout: () => void;
  currentUserData: UserDataStore | null;
  createMetadataFolder: (name: string) => void;
  deleteMetadataFolder: (folderId: string) => void;
  addPdfFilesToFolder: (folderId: string, files: PdfFile[]) => void;
  createMetadataFolderAndAddPdfs: (folderName: string, files: PdfFile[]) => void;
  updatePdfFile: (pdfId: string, updates: Partial<PdfFile>) => void;
  deletePdfFile: (folderId: string, pdfId: string) => void;
  addMetadataAsset: (pdfId: string, newAsset: ExtractedAsset) => void;
  updateMetadataAsset: (pdfId: string, assetId: string, updates: Partial<any>) => void;
  deleteMetadataAsset: (pdfId: string, assetId: string) => void;
  createBookFolder: (name: string) => void;
  deleteBookFolder: (folderId: string) => void;
  addBookFilesToFolder: (folderId: string, files: BookFile[]) => void;
  updateBookFile: (bookId: string, updates: Partial<BookFile>) => void;
  deleteBookFile: (folderId: string, bookId: string) => void;
  createComplianceProfile: (name: string) => void;
  deleteComplianceProfile: (profileId: string) => void;
  addRuleFilesToProfile: (profileId: string, newRuleFiles: Record<string, any>) => void;
  deleteRuleFileFromProfile: (profileId: string, ruleFileId: string) => void;
  createComplianceFolder: (name: string, profileId: string | null) => void;
  deleteComplianceFolder: (folderId: string) => void;
  updateComplianceFolderProfile: (folderId: string, profileId: string | null) => void;
  addManuscriptsToComplianceFolder: (folderId: string, files: ManuscriptFile[]) => void;
  updateComplianceManuscript: (manuscriptId: string, updates: Partial<ManuscriptFile>) => void;
  deleteComplianceManuscript: (folderId: string, manuscriptId: string) => void;
  createAnalysisFolder: (name: string) => void;
  deleteAnalysisFolder: (folderId: string) => void;
  addManuscriptsToAnalysisFolder: (folderId: string, files: ManuscriptFile[]) => void;
  updateAnalysisManuscript: (manuscriptId: string, updates: Partial<ManuscriptFile>) => void;
  deleteAnalysisManuscript: (folderId: string, manuscriptId: string) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

const defaultUserData: UserDataStore = {
    metadataFolders: [],
    bookFolders: [],
    complianceFolders: [],
    analysisFolders: [],
    complianceProfiles: [],
    ruleFiles: {},
};

// --- REDUCER SETUP ---

interface CombinedState {
  theme: 'light' | 'dark';
  statusBarMessage: StatusBarMessage | null;
  appState: AppState;
  isInitialized: boolean;
}

type Action =
  | { type: 'INITIALIZE_STATE'; payload: AppState }
  | { type: 'SET_INITIALIZED' }
  | { type: 'TOGGLE_THEME' }
  | { type: 'SET_STATUS_MESSAGE'; payload: StatusBarMessage }
  | { type: 'CLEAR_STATUS_MESSAGE'; payload: { id: string } }
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'ADD_USER'; payload: User }
  | { type: 'DELETE_USER'; payload: number }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'ADD_USAGE_LOG'; payload: UsageLog }
  | { type: 'UPDATE_CURRENT_USER_STORE'; payload: (store: UserDataStore) => UserDataStore };

const appReducer = (state: CombinedState, action: Action): CombinedState => {
  switch (action.type) {
    case 'INITIALIZE_STATE':
        return { ...state, appState: action.payload };
    case 'SET_INITIALIZED':
        return { ...state, isInitialized: true };
    case 'TOGGLE_THEME':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' };
    case 'SET_STATUS_MESSAGE':
      return { ...state, statusBarMessage: action.payload };
    case 'CLEAR_STATUS_MESSAGE':
      if (state.statusBarMessage && state.statusBarMessage.id === action.payload.id) {
          return { ...state, statusBarMessage: null };
      }
      return state;
    case 'LOGIN':
        return { ...state, appState: { ...state.appState, currentUserId: action.payload.id, users: state.appState.users.map(u => u.id === action.payload.id ? action.payload : u) } };
    case 'LOGOUT':
        return { ...state, appState: { ...state.appState, currentUserId: null } };
    case 'ADD_USER':
        return { ...state, appState: { ...state.appState, users: [...state.appState.users, action.payload], appData: { ...state.appState.appData, [action.payload.id]: { ...defaultUserData } } } };
    case 'DELETE_USER': {
        const newAppData = { ...state.appState.appData };
        delete newAppData[action.payload];
        return { ...state, appState: { ...state.appState, users: state.appState.users.filter(u => u.id !== action.payload), appData: newAppData } };
    }
    case 'UPDATE_USER':
        return { ...state, appState: { ...state.appState, users: state.appState.users.map(u => u.id === action.payload.id ? {...u, ...action.payload} : u) } };
    case 'ADD_USAGE_LOG': {
        const totalTokens = action.payload.promptTokens + action.payload.responseTokens;
        return { ...state, appState: { ...state.appState, usageLogs: [action.payload, ...state.appState.usageLogs], users: state.appState.users.map(u => (u.id === action.payload.userId ? { ...u, tokensUsed: u.tokensUsed + totalTokens } : u)) } };
    }
    case 'UPDATE_CURRENT_USER_STORE': {
      const { currentUserId, appData } = state.appState;
      if (!currentUserId) return state;
      const currentStore = appData[currentUserId] || defaultUserData;
      const newStore = action.payload(currentStore);
      return { ...state, appState: { ...state.appState, appData: { ...appData, [currentUserId]: newStore } } };
    }
    default:
      return state;
  }
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, {
    theme: 'dark',
    statusBarMessage: null,
    appState: { users: [], usageLogs: [], currentUserId: null, appData: {} },
    isInitialized: false,
  });

  useEffect(() => {
    const loadedState = loadInitialState();
    dispatch({ type: 'INITIALIZE_STATE', payload: loadedState });
    dispatch({ type: 'SET_INITIALIZED' });
  }, []);

  useEffect(() => {
    if (state.isInitialized) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state.appState, version: 1 }));
    }
  }, [state.appState, state.isInitialized]);

  const currentUser = useMemo(() => state.appState.users.find(u => u.id === state.appState.currentUserId) || null, [state.appState.currentUserId, state.appState.users]);
  const currentUserData = useMemo(() => currentUser ? state.appState.appData[currentUser.id] || defaultUserData : null, [state.appState.appData, currentUser]);
  
  const setStatusBarMessage = useCallback((message: string, type: 'success' | 'error' | 'info') => {
      const id = Math.random().toString(36).substring(2, 9);
      dispatch({ type: 'SET_STATUS_MESSAGE', payload: { id, message, type } });

      setTimeout(() => {
          dispatch({ type: 'CLEAR_STATUS_MESSAGE', payload: { id } });
      }, 5000);
  }, []);
  
  const toggleTheme = useCallback(() => dispatch({ type: 'TOGGLE_THEME' }), []);

  const login = useCallback((email: string, password?: string): boolean => {
    const userToLogin = state.appState.users.find(u => u.email === email);
    if (userToLogin) {
        if (userToLogin.password === password) {
            if (userToLogin.status === 'inactive') { setStatusBarMessage('This account is inactive.', 'error'); return false; }
            const updatedUser = { ...userToLogin, lastLogin: new Date().toISOString() };
            dispatch({ type: 'LOGIN', payload: updatedUser });
            setStatusBarMessage(`Welcome back, ${email}!`, 'success');
            return true;
        } else {
            setStatusBarMessage('Invalid password. Please try again.', 'error'); return false;
        }
    } else {
        setStatusBarMessage(`User with email ${email} not found.`, 'error'); return false;
    }
  }, [state.appState.users, setStatusBarMessage]);

  const logout = useCallback(() => {
    setStatusBarMessage('You have been logged out.', 'info');
    dispatch({ type: 'LOGOUT' });
  }, [setStatusBarMessage]);

  const addUser = useCallback((email: string, role: Role, tokenCap: number, password: string, status: 'active' | 'inactive') => {
    if (state.appState.users.some(u => u.email === email)) { setStatusBarMessage(`User with email ${email} already exists.`, 'error'); return; }
    const newUser: User = { id: Math.max(0, ...state.appState.users.map(u => u.id)) + 1, email, password, role, tokenCap, tokensUsed: 0, lastLogin: new Date().toISOString(), status, canUseProModel: role === Role.Admin };
    dispatch({ type: 'ADD_USER', payload: newUser });
    setStatusBarMessage(`User ${email} added successfully.`, 'success');
  }, [state.appState.users, setStatusBarMessage]);

  const deleteUser = useCallback((userId: number) => {
    if (userId === currentUser?.id) { setStatusBarMessage("Cannot delete the currently logged-in user.", 'error'); return; }
    dispatch({ type: 'DELETE_USER', payload: userId });
    setStatusBarMessage(`User with ID ${userId} deleted.`, 'info');
  }, [currentUser, setStatusBarMessage]);

  const updateUser = useCallback((updatedUser: User) => {
    dispatch({ type: 'UPDATE_USER', payload: updatedUser });
    setStatusBarMessage(`User ${updatedUser.email} updated.`, 'success');
  }, [setStatusBarMessage]);

  const addUsageLog = useCallback((log: Omit<UsageLog, 'id' | 'timestamp' | 'promptTokens' | 'responseTokens'>): { promptTokens: number, responseTokens: number } => {
    const promptTokens = Math.floor(Math.random() * 3000) + 500;
    const responseTokens = Math.floor(Math.random() * 2000) + 300;
    const newLog: UsageLog = { ...log, id: `log_${Date.now()}`, timestamp: new Date().toISOString(), promptTokens, responseTokens };
    dispatch({ type: 'ADD_USAGE_LOG', payload: newLog });
    return { promptTokens, responseTokens };
  }, []);

  const updateCurrentUserStore = useCallback((updater: (store: UserDataStore) => UserDataStore) => dispatch({ type: 'UPDATE_CURRENT_USER_STORE', payload: updater }), []);

  const createMetadataFolder = useCallback((name: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: [...store.metadataFolders, { id: Date.now().toString(), name, pdfFiles: [] }] })), [updateCurrentUserStore]);
  const deleteMetadataFolder = useCallback((folderId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.filter(f => f.id !== folderId) })), [updateCurrentUserStore]);
  const addPdfFilesToFolder = useCallback((folderId: string, files: PdfFile[]) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => f.id === folderId ? { ...f, pdfFiles: [...f.pdfFiles, ...files] } : f) })), [updateCurrentUserStore]);
  const createMetadataFolderAndAddPdfs = useCallback((folderName: string, files: PdfFile[]) => {
    const newFolder = { id: Date.now().toString(), name: folderName, pdfFiles: files };
    updateCurrentUserStore(store => ({ ...store, metadataFolders: [...store.metadataFolders, newFolder] }));
  }, [updateCurrentUserStore]);
  const updatePdfFile = useCallback((pdfId: string, updates: Partial<PdfFile>) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, ...updates } : p) })) })), [updateCurrentUserStore]);
  const deletePdfFile = useCallback((folderId: string, pdfId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => f.id === folderId ? { ...f, pdfFiles: f.pdfFiles.filter(p => p.id !== pdfId) } : f) })), [updateCurrentUserStore]);
  
  const addMetadataAsset = useCallback((pdfId: string, newAsset: ExtractedAsset) => {
    updateCurrentUserStore(store => ({
      ...store,
      metadataFolders: store.metadataFolders.map(f => ({
        ...f,
        pdfFiles: f.pdfFiles.map(p => {
          if (p.id === pdfId) {
            const newAssets = [...(p.assets || []), newAsset];
            newAssets.sort((a, b) => {
              if (a.pageNumber !== b.pageNumber) {
                return (a.pageNumber ?? 0) - (b.pageNumber ?? 0);
              }
              if (a.boundingBox && b.boundingBox) {
                return a.boundingBox.y - b.boundingBox.y;
              }
              return 0;
            });
            return { ...p, assets: newAssets };
          }
          return p;
        })
      }))
    }));
  }, [updateCurrentUserStore]);

  const updateMetadataAsset = useCallback((pdfId: string, assetId: string, updates: Partial<any>) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, assets: p.assets?.map(a => a.id === assetId ? { ...a, ...updates } : a) } : p) })) })), [updateCurrentUserStore]);
  const deleteMetadataAsset = useCallback((pdfId: string, assetId: string) => updateCurrentUserStore(store => ({ ...store, metadataFolders: store.metadataFolders.map(f => ({ ...f, pdfFiles: f.pdfFiles.map(p => p.id === pdfId ? { ...p, assets: p.assets?.filter(a => a.id !== assetId) } : p) })) })), [updateCurrentUserStore]);

  // Book Metadata Actions
  const createBookFolder = useCallback((name: string) => updateCurrentUserStore(store => ({ ...store, bookFolders: [...store.bookFolders, { id: Date.now().toString(), name, bookFiles: [] }] })), [updateCurrentUserStore]);
  const deleteBookFolder = useCallback((folderId: string) => updateCurrentUserStore(store => ({ ...store, bookFolders: store.bookFolders.filter(f => f.id !== folderId) })), [updateCurrentUserStore]);
  const addBookFilesToFolder = useCallback((folderId: string, files: BookFile[]) => updateCurrentUserStore(store => ({ ...store, bookFolders: store.bookFolders.map(f => f.id === folderId ? { ...f, bookFiles: [...f.bookFiles, ...files] } : f) })), [updateCurrentUserStore]);
  const updateBookFile = useCallback((bookId: string, updates: Partial<BookFile>) => updateCurrentUserStore(store => ({ ...store, bookFolders: store.bookFolders.map(f => ({ ...f, bookFiles: f.bookFiles.map(p => p.id === bookId ? { ...p, ...updates } : p) })) })), [updateCurrentUserStore]);
  const deleteBookFile = useCallback((folderId: string, bookId: string) => updateCurrentUserStore(store => ({ ...store, bookFolders: store.bookFolders.map(f => f.id === folderId ? { ...f, bookFiles: f.bookFiles.filter(p => p.id !== bookId) } : f) })), [updateCurrentUserStore]);

  const createComplianceProfile = useCallback((name: string) => updateCurrentUserStore(store => ({ ...store, complianceProfiles: [...store.complianceProfiles, { id: Date.now().toString(), name, ruleFileIds: [] }] })), [updateCurrentUserStore]);
  const deleteComplianceProfile = useCallback((profileId: string) => updateCurrentUserStore(store => ({ ...store, complianceProfiles: store.complianceProfiles.filter(p => p.id !== profileId) })), [updateCurrentUserStore]);
  const addRuleFilesToProfile = useCallback((profileId: string, newRuleFiles: Record<string, any>) => updateCurrentUserStore(store => ({ ...store, ruleFiles: { ...store.ruleFiles, ...newRuleFiles }, complianceProfiles: store.complianceProfiles.map(p => p.id === profileId ? { ...p, ruleFileIds: [...p.ruleFileIds, ...Object.keys(newRuleFiles)] } : p) })), [updateCurrentUserStore]);
  const deleteRuleFileFromProfile = useCallback((profileId: string, ruleFileId: string) => updateCurrentUserStore(store => ({...store, complianceProfiles: store.complianceProfiles.map(p => p.id === profileId ? { ...p, ruleFileIds: p.ruleFileIds.filter(id => id !== ruleFileId) } : p) })), [updateCurrentUserStore]);
  
  const createComplianceFolder = useCallback((name: string, profileId: string | null) => updateCurrentUserStore(store => ({ ...store, complianceFolders: [...store.complianceFolders, { id: Date.now().toString(), name, profileId, manuscripts: [] }] })), [updateCurrentUserStore]);
  const deleteComplianceFolder = useCallback((folderId: string) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.filter(f => f.id !== folderId) })), [updateCurrentUserStore]);
  const updateComplianceFolderProfile = useCallback((folderId: string, profileId: string | null) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, profileId } : f) })), [updateCurrentUserStore]);
  const addManuscriptsToComplianceFolder = useCallback((folderId: string, files: ManuscriptFile[]) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, manuscripts: [...f.manuscripts, ...files] } : f) })), [updateCurrentUserStore]);
  const updateComplianceManuscript = useCallback((manuscriptId: string, updates: Partial<ManuscriptFile>) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => ({ ...f, manuscripts: f.manuscripts.map(m => m.id === manuscriptId ? { ...m, ...updates } : m) })) })), [updateCurrentUserStore]);
  const deleteComplianceManuscript = useCallback((folderId: string, manuscriptId: string) => updateCurrentUserStore(store => ({ ...store, complianceFolders: store.complianceFolders.map(f => f.id === folderId ? { ...f, manuscripts: f.manuscripts.filter(m => m.id !== manuscriptId) } : f) })), [updateCurrentUserStore]);

  const createAnalysisFolder = useCallback((name: string) => updateCurrentUserStore(store => ({ ...store, analysisFolders: [...store.analysisFolders, { id: Date.now().toString(), name, manuscripts: [] }] })), [updateCurrentUserStore]);
  const deleteAnalysisFolder = useCallback((folderId: string) => updateCurrentUserStore(store => ({ ...store, analysisFolders: store.analysisFolders.filter(f => f.id !== folderId) })), [updateCurrentUserStore]);
  const addManuscriptsToAnalysisFolder = useCallback((folderId: string, files: ManuscriptFile[]) => updateCurrentUserStore(store => ({ ...store, analysisFolders: store.analysisFolders.map(f => f.id === folderId ? { ...f, manuscripts: [...f.manuscripts, ...files] } : f) })), [updateCurrentUserStore]);
  const updateAnalysisManuscript = useCallback((manuscriptId: string, updates: Partial<ManuscriptFile>) => updateCurrentUserStore(store => ({ ...store, analysisFolders: store.analysisFolders.map(f => ({ ...f, manuscripts: f.manuscripts.map(m => m.id === manuscriptId ? { ...m, ...updates } : m) })) })), [updateCurrentUserStore]);
  const deleteAnalysisManuscript = useCallback((folderId: string, manuscriptId: string) => updateCurrentUserStore(store => ({ ...store, analysisFolders: store.analysisFolders.map(f => f.id === folderId ? { ...f, manuscripts: f.manuscripts.filter(m => m.id !== manuscriptId) } : f) })), [updateCurrentUserStore]);


  const contextValue = useMemo(() => ({
    theme: state.theme,
    toggleTheme,
    users: state.appState.users,
    usageLogs: state.appState.usageLogs,
    currentUser,
    addUser,
    deleteUser,
    updateUser,
    addUsageLog,
    statusBarMessage: state.statusBarMessage,
    setStatusBarMessage,
    login,
    logout,
    currentUserData,
    createMetadataFolder, deleteMetadataFolder, addPdfFilesToFolder, createMetadataFolderAndAddPdfs,
    updatePdfFile, deletePdfFile, addMetadataAsset, updateMetadataAsset, deleteMetadataAsset,
    createBookFolder, deleteBookFolder, addBookFilesToFolder, updateBookFile, deleteBookFile,
    createComplianceProfile, deleteComplianceProfile, addRuleFilesToProfile,
    deleteRuleFileFromProfile, createComplianceFolder, deleteComplianceFolder,
    updateComplianceFolderProfile, addManuscriptsToComplianceFolder: addManuscriptsToComplianceFolder, updateComplianceManuscript: updateComplianceManuscript, deleteComplianceManuscript: deleteComplianceManuscript,
    createAnalysisFolder, deleteAnalysisFolder, addManuscriptsToAnalysisFolder, updateAnalysisManuscript, deleteAnalysisManuscript,
  }), [state, currentUser, currentUserData, toggleTheme, addUser, deleteUser, updateUser, addUsageLog, setStatusBarMessage, login, logout, createMetadataFolder, deleteMetadataFolder, addPdfFilesToFolder, createMetadataFolderAndAddPdfs, updatePdfFile, deletePdfFile, addMetadataAsset, updateMetadataAsset, deleteMetadataAsset, createBookFolder, deleteBookFolder, addBookFilesToFolder, updateBookFile, deleteBookFile, createComplianceProfile, deleteComplianceProfile, addRuleFilesToProfile, deleteRuleFileFromProfile, createComplianceFolder, deleteComplianceFolder, updateComplianceFolderProfile, addManuscriptsToComplianceFolder, updateComplianceManuscript, deleteComplianceManuscript, createAnalysisFolder, deleteAnalysisFolder, addManuscriptsToAnalysisFolder, updateAnalysisManuscript, deleteAnalysisManuscript]);

  if (!state.isInitialized) return null;

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>;
};