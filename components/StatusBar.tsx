import React from 'react';
import { useAppContext } from '../hooks/useAppContext';
import CheckCircleIcon from './icons/CheckCircleIcon';
import ExclamationCircleIcon from './icons/ExclamationCircleIcon';
import { InfoIcon } from './icons/Icons';

const StatusBar: React.FC = () => {
    const { statusBarMessage } = useAppContext();

    if (!statusBarMessage) {
        return <span className="text-xs text-gray-500 dark:text-gray-400">&copy; 2025 S4Carlisle Publishing Services Private Limited</span>;
    }

    const { type, message } = statusBarMessage;

    const config = {
        success: { Icon: CheckCircleIcon, colorClass: 'text-green-400' },
        error: { Icon: ExclamationCircleIcon, colorClass: 'text-red-400' },
        info: { Icon: InfoIcon, colorClass: 'text-blue-400' },
    };

    const { Icon, colorClass } = config[type];

    return (
        <div className={`flex items-center space-x-2 text-xs ${colorClass} transition-opacity duration-300 animate-fade-in`}>
            <Icon className="h-4 w-4" />
            <span>{message}</span>
        </div>
    );
};

export default StatusBar;
