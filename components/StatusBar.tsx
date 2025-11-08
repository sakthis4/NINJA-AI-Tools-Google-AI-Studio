
import React from 'react';
import { useAppContext } from '../hooks/useAppContext';
import CheckCircleIcon from './icons/CheckCircleIcon';
import ExclamationCircleIcon from './icons/ExclamationCircleIcon';
import { InfoIcon, ShieldCheckIcon } from './icons/Icons';

const StatusBar: React.FC = () => {
    const { statusBarMessage } = useAppContext();

    if (!statusBarMessage) {
        return (
            <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                <ShieldCheckIcon className="h-4 w-4" />
                <span>End-to-end data encryption enabled</span>
            </div>
        );
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
