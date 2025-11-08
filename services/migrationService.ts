import { StoredAppState, AppState, User, UsageLog, UserDataStore } from '../types';
import { USERS, USAGE_LOGS } from '../constants';

export const STORAGE_KEY = 's4c_ai_app_state';

const LEGACY_KEYS = {
    USERS: 'app_users',
    USAGE_LOGS: 'app_usage_logs',
    CURRENT_USER: 'app_current_user',
    APP_DATA: 'app_data_store',
};

const getStoredValue = <T,>(key: string, defaultValue: T): T => {
    try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error(`Error parsing legacy localStorage key “${key}”:`, error);
        return defaultValue;
    }
};

const defaultUserDataStore: UserDataStore = {
    metadataFolders: [],
    complianceFolders: [],
    complianceProfiles: [],
    ruleFiles: {},
    generatedReports: [],
};

// This function migrates data from the old multi-key format to the new single-key, versioned format.
const migrateV0toV1 = (): StoredAppState | null => {
    // Check if any legacy data exists. If not, no migration needed.
    const legacyUserKey = window.localStorage.getItem(LEGACY_KEYS.USERS);
    if (!legacyUserKey) {
        return null;
    }
    
    console.log("Legacy data found. Starting migration to V1 state...");

    // Load all data from old keys, providing defaults if they are missing.
    const users: User[] = getStoredValue(LEGACY_KEYS.USERS, USERS);
    const usageLogs: UsageLog[] = getStoredValue(LEGACY_KEYS.USAGE_LOGS, USAGE_LOGS);
    const appData: Record<number, UserDataStore> = getStoredValue(LEGACY_KEYS.APP_DATA, {});
    const currentUser: User | null = getStoredValue(LEGACY_KEYS.CURRENT_USER, null);

    // Ensure every user has an entry in appData
    users.forEach(user => {
        if (!appData[user.id]) {
            appData[user.id] = { ...defaultUserDataStore };
        }
    });

    const migratedState: StoredAppState = {
        version: 1,
        users,
        usageLogs,
        appData,
        currentUserId: currentUser ? currentUser.id : null,
    };
    
    // Save the new unified state
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedState));
    
    // Clean up old keys
    Object.values(LEGACY_KEYS).forEach(key => window.localStorage.removeItem(key));
    
    console.log("Migration complete. Legacy keys removed.");
    return migratedState;
};

// The main function to load application state. It handles migration if necessary.
export const loadInitialState = (): AppState => {
    const storedStateJSON = window.localStorage.getItem(STORAGE_KEY);
    
    // If new state exists, use it.
    if (storedStateJSON) {
        try {
            const storedState: StoredAppState = JSON.parse(storedStateJSON);
            // Here you could add future migration steps, e.g., if (storedState.version < 2) migrateV1toV2(...)
            return storedState;
        } catch {
            // Handle parsing error by falling back
        }
    }
    
    // If no new state, try to migrate from legacy.
    const migratedState = migrateV0toV1();
    if (migratedState) {
        return migratedState;
    }
    
    // If no data exists at all, create a fresh default state.
    console.log("No existing data. Initializing with default state.");
    const defaultState: AppState = {
        users: USERS,
        usageLogs: USAGE_LOGS,
        currentUserId: null,
        appData: USERS.reduce((acc, user) => {
            acc[user.id] = { ...defaultUserDataStore };
            return acc;
        }, {} as Record<number, UserDataStore>),
    };

    return defaultState;
};
