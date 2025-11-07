
import React from 'react';
import { useAppContext } from '../hooks/useAppContext';
import { SunIcon, MoonIcon, InfoIcon, UserCircleIcon } from './icons/Icons';
import { Role } from '../types';

export default function Header() {
  const { theme, toggleTheme, currentUser, logout } = useAppContext();
  
  const tokensRemaining = currentUser ? currentUser.tokenCap - currentUser.tokensUsed : 0;
  const percentageUsed = currentUser ? (currentUser.tokensUsed / currentUser.tokenCap) * 100 : 0;

  return (
    <header className="flex-shrink-0 bg-white dark:bg-gray-800 shadow-md">
      <div className="flex items-center justify-between p-4 h-16">
        <div className="flex items-center space-x-4">
            {/* User display instead of switcher */}
             <div className="flex items-center space-x-3">
                <UserCircleIcon className="h-9 w-9 text-gray-500 dark:text-gray-400" />
                <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{currentUser?.email}</p>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${currentUser?.role === Role.Admin ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'}`}>{currentUser?.role}</span>
                </div>
            </div>
        </div>
        
        <div className="flex items-center space-x-2 md:space-x-4">
          <div className="group relative hidden md:flex items-center space-x-2">
            <div className="w-48 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full ${percentageUsed > 85 ? 'bg-red-500' : percentageUsed > 60 ? 'bg-yellow-500' : 'bg-primary-500'}`}
                style={{ width: `${percentageUsed}%` }}
              ></div>
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{tokensRemaining.toLocaleString()} tokens left</span>
            <InfoIcon className="h-4 w-4 text-gray-500" />
            <div className="absolute bottom-full mb-2 w-72 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-xs rounded py-2 px-3 z-10 shadow-lg">
              Token usage is based on Gemini API billing: prompt + response tokens.
              <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-gray-800"></div>
            </div>
          </div>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <MoonIcon className="h-6 w-6" /> : <SunIcon className="h-6 w-6" />}
          </button>
           <button
            onClick={logout}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            title="Logout"
            aria-label="Logout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
