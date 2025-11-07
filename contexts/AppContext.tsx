
import React, { createContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';
import { User, Role, UsageLog, ToastData } from '../types';
import { USERS, USAGE_LOGS } from '../constants';

interface AppContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  users: User[];
  currentUser: User | null;
  setCurrentUser: (user: User) => void;
  addUser: (email: string, role: Role, tokenCap: number) => void;
  deleteUser: (userId: number) => void;
  updateUser: (user: User) => void;
  usageLogs: UsageLog[];
  addUsageLog: (log: Omit<UsageLog, 'id' | 'timestamp' | 'promptTokens' | 'responseTokens'>) => { promptTokens: number, responseTokens: number };
  toasts: ToastData[];
  addToast: (toast: Omit<ToastData, 'id'>) => void;
  removeToast: (id: string) => void;
  login: (email: string, password?: string) => boolean;
  logout: () => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper to read from localStorage safely
const getStoredValue = <T,>(key: string, initialValue: T): T => {
    try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
    } catch (error) {
        console.error(`Error reading localStorage key “${key}”:`, error);
        return initialValue;
    }
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [users, setUsers] = useState<User[]>(() => getStoredValue('app_users', USERS));
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>(() => getStoredValue('app_usage_logs', USAGE_LOGS));
  const [currentUser, setCurrentUser] = useState<User | null>(() => getStoredValue('app_current_user', null));
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Persist users and usageLogs to localStorage
  useEffect(() => {
      try {
          const usersToSave = users.map(({ password, ...user }) => user);
          window.localStorage.setItem('app_users', JSON.stringify(usersToSave));
      } catch (error) {
          console.error("Failed to save users to localStorage:", error);
      }
  }, [users]);
  
  useEffect(() => {
      try {
          window.localStorage.setItem('app_usage_logs', JSON.stringify(usageLogs));
      } catch (error) {
          console.error("Failed to save usage logs to localStorage:", error);
      }
  }, [usageLogs]);

  // Persist currentUser to localStorage
  useEffect(() => {
      try {
          if (currentUser) {
              const { password, ...userToSave } = currentUser;
              window.localStorage.setItem('app_current_user', JSON.stringify(userToSave));
          } else {
              window.localStorage.removeItem('app_current_user');
          }
      } catch (error) {
          console.error("Failed to save currentUser to localStorage:", error);
      }
  }, [currentUser]);

  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [{ id, ...toast }, ...prev]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);
  
  const login = useCallback((email: string, password?: string): boolean => {
    const userToLogin = users.find(u => u.email === email);
    if (userToLogin && userToLogin.password === password) {
        if (userToLogin.status === 'inactive') {
            addToast({ type: 'error', message: 'This account is inactive.' });
            return false;
        }
        const updatedUser = { ...userToLogin, lastLogin: new Date().toISOString() };
        setCurrentUser(updatedUser);
        setUsers(prevUsers => prevUsers.map(u => (u.id === updatedUser.id ? updatedUser : u)));
        addToast({ type: 'success', message: `Welcome back, ${email}!` });
        return true;
    }
    return false;
  }, [users, addToast]);

  const logout = useCallback(() => {
    addToast({ type: 'info', message: 'You have been logged out.' });
    setCurrentUser(null);
  }, [addToast]);
  
  const addUser = useCallback((email: string, role: Role, tokenCap: number) => {
    setUsers(prevUsers => {
        const newUser: User = {
            id: Math.max(0, ...prevUsers.map(u => u.id)) + 1,
            email,
            // In a real app, this would be a securely hashed password
            password: 'password123', 
            role,
            tokenCap,
            tokensUsed: 0,
            lastLogin: new Date().toISOString(),
            status: 'active'
        };
        addToast({type: 'success', message: `User ${email} added successfully.`});
        return [...prevUsers, newUser];
    });
  }, [addToast]);

  const deleteUser = useCallback((userId: number) => {
    if (userId === currentUser?.id) {
        addToast({type: 'error', message: "Cannot delete the currently logged-in user."});
        return;
    }
    setUsers(prev => prev.filter(u => u.id !== userId));
    addToast({type: 'info', message: `User with ID ${userId} deleted.`});
  }, [currentUser, addToast]);

  const updateUser = useCallback((updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? {...u, ...updatedUser} : u));
    setCurrentUser(current => (current?.id === updatedUser.id ? {...current, ...updatedUser} : current));
    addToast({type: 'success', message: `User ${updatedUser.email} updated.`});
  }, [addToast]);
  
  const addUsageLog = useCallback((log: Omit<UsageLog, 'id' | 'timestamp' | 'promptTokens' | 'responseTokens'>): { promptTokens: number, responseTokens: number } => {
    // In a real app, tokens would come from the API response. Here we mock them.
    // FIX: Call Math.random() as a function to generate random numbers.
    const promptTokens = Math.floor(Math.random() * 3000) + 500;
    const responseTokens = Math.floor(Math.random() * 2000) + 300;
    const totalTokens = promptTokens + responseTokens;

    const newLog: UsageLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toISOString(),
      promptTokens,
      responseTokens
    };
    
    setUsageLogs(prev => [newLog, ...prev]);

    const updateUserWithTokens = (user: User) => ({
      ...user,
      tokensUsed: user.tokensUsed + totalTokens,
    });
    
    setUsers(prevUsers => prevUsers.map(u => (u.id === log.userId ? updateUserWithTokens(u) : u)));
    
    setCurrentUser(prevCurrentUser =>
      prevCurrentUser?.id === log.userId ? updateUserWithTokens(prevCurrentUser) : prevCurrentUser
    );

    return { promptTokens, responseTokens };
  }, []);

  const contextValue = useMemo(() => ({
    theme,
    toggleTheme,
    users,
    currentUser,
    setCurrentUser,
    addUser,
    deleteUser,
    updateUser,
    usageLogs,
    addUsageLog,
    toasts,
    addToast,
    removeToast,
    login,
    logout,
  }), [
    theme, users, currentUser, usageLogs, toasts,
    toggleTheme, addUser, deleteUser, updateUser, addUsageLog, addToast, removeToast, login, logout
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};
