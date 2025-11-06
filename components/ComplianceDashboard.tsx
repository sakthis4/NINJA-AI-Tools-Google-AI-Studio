
import React from 'react';
import { ComplianceReport, ComplianceStatus, ComplianceItem } from '../types';
import CheckCircleIcon from './icons/CheckCircleIcon';
import XCircleIcon from './icons/XCircleIcon';
import ExclamationCircleIcon from './icons/ExclamationCircleIcon';
import MinusCircleIcon from './icons/MinusCircleIcon';

interface ComplianceDashboardProps {
  report: ComplianceReport;
}

const getStatusVisuals = (status: ComplianceStatus) => {
  switch (status) {
    case ComplianceStatus.COMPLIANT:
      return {
        icon: <CheckCircleIcon />,
        textColor: 'text-green-400',
        bgColor: 'bg-green-900/50',
      };
    case ComplianceStatus.NOT_COMPLIANT:
      return {
        icon: <XCircleIcon />,
        textColor: 'text-red-400',
        bgColor: 'bg-red-900/50',
      };
    case ComplianceStatus.PARTIALLY_COMPLIANT:
      return {
        icon: <ExclamationCircleIcon />,
        textColor: 'text-yellow-400',
        bgColor: 'bg-yellow-900/50',
      };
    case ComplianceStatus.NOT_APPLICABLE:
      return {
        icon: <MinusCircleIcon />,
        textColor: 'text-gray-400',
        bgColor: 'bg-gray-700/50',
      };
    default:
      return {
        icon: null,
        textColor: 'text-gray-400',
        bgColor: 'bg-gray-800',
      };
  }
};


const ComplianceItemCard: React.FC<{ item: ComplianceItem, index: number }> = ({ item, index }) => {
    const { icon, textColor, bgColor } = getStatusVisuals(item.status);
    const formattedStatus = item.status.replace(/_/g, ' ').toLowerCase();

    return (
        <div className={`border border-gray-700 rounded-lg p-4 sm:p-6 ${bgColor}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                 <h3 className="text-lg font-semibold text-gray-100 flex-1 break-words">
                    {index + 1}. {item.checklistItem}
                </h3>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${textColor} ${bgColor.replace('/50', '/90')} border ${textColor.replace('text-', 'border-')}`}>
                    {icon}
                    <span className="capitalize">{formattedStatus}</span>
                </div>
            </div>
            
            <div className="space-y-4">
                <div>
                    <h4 className="font-semibold text-cyan-400 mb-1">Evidence</h4>
                    <p className="text-gray-300 bg-gray-900/50 p-3 rounded-md border border-gray-700 italic">"{item.evidence}"</p>
                </div>
                <div>
                    <h4 className="font-semibold text-cyan-400 mb-1">Reasoning</h4>
                    <p className="text-gray-300">{item.reasoning}</p>
                </div>
            </div>
        </div>
    );
};


const ComplianceDashboard: React.FC<ComplianceDashboardProps> = ({ report }) => {
  return (
    <div className="bg-gray-800/50 p-4 sm:p-6 rounded-2xl shadow-lg border border-gray-700">
      <h2 className="text-3xl font-bold mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-500">
        Compliance Report
      </h2>
       <div className="space-y-4">
        {report.map((item, index) => (
          <ComplianceItemCard key={index} item={item} index={index} />
        ))}
      </div>
    </div>
  );
};

export default ComplianceDashboard;
