
import React, { useEffect } from 'react';
import { useAppContext } from '../hooks/useAppContext';
import { XIcon } from './icons/Icons';

// Local, prop-accepting icon components with a solid style for a modern look.
const CheckCircleIcon: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);

const ExclamationCircleIcon: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
  </svg>
);

const InfoCircleIcon: React.FC<{ className?: string }> = ({ className = "h-6 w-6" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
);

const typeConfig = {
  success: {
    Icon: CheckCircleIcon,
    iconContainerClass: 'bg-green-100 dark:bg-green-900/30',
    iconClass: 'text-green-500 dark:text-green-400',
  },
  error: {
    Icon: ExclamationCircleIcon,
    iconContainerClass: 'bg-red-100 dark:bg-red-900/30',
    iconClass: 'text-red-500 dark:text-red-400',
  },
  info: {
    Icon: InfoCircleIcon,
    iconContainerClass: 'bg-blue-100 dark:bg-blue-900/30',
    iconClass: 'text-blue-500 dark:text-blue-400',
  },
};

interface ToastProps {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ id, type, message, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const { Icon, iconContainerClass, iconClass } = typeConfig[type];

  return (
    <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-xl pointer-events-auto ring-1 ring-black dark:ring-gray-700 ring-opacity-5">
      <div className="p-4">
        <div className="flex items-center">
          <div className={`flex-shrink-0 p-2 rounded-full ${iconContainerClass}`}>
            <Icon className={`h-6 w-6 ${iconClass}`} />
          </div>
          <div className="ml-3 w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {message}
            </p>
          </div>
          <div className="ml-4 flex-shrink-0">
            <button
              onClick={() => onDismiss(id)}
              className="p-1 rounded-full inline-flex text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-800"
            >
              <span className="sr-only">Close</span>
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function ToastContainer() {
  const { toasts, removeToast } = useAppContext();

  return (
    <div className="fixed inset-0 flex items-end justify-center px-4 py-6 pointer-events-none sm:p-6 sm:items-end sm:justify-end z-50">
      <div className="flex flex-col items-center space-y-4 sm:items-end">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            {...toast}
            onDismiss={removeToast}
          />
        ))}
      </div>
    </div>
  );
}
