import React, { useMemo } from 'react';
import { useAppContext } from '../hooks/useAppContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { UsageLog } from '../types';
import { DownloadIcon } from '../components/icons/Icons';

// Helper to escape CSV fields
const escapeCsvField = (field: any): string => {
    if (field === null || field === undefined) {
        return '""';
    }
    const stringField = String(field);
    if (/[",\n]/.test(stringField)) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }
    return `"${stringField}"`;
};

export default function UsageDashboard() {
  const { currentUser, usageLogs, currentUserData, setStatusBarMessage } = useAppContext();

  const userLogs = currentUser ? usageLogs.filter(log => log.userId === currentUser.id) : [];

  const data = useMemo(() => userLogs.map(log => ({
    name: new Date(log.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tokens: log.promptTokens + log.responseTokens,
    promptTokens: log.promptTokens,
    responseTokens: log.responseTokens,
  })), [userLogs]);
  
  const tokensRemaining = currentUser ? currentUser.tokenCap - currentUser.tokensUsed : 0;
  const percentageUsed = currentUser ? (currentUser.tokensUsed / currentUser.tokenCap) * 100 : 0;
  
  const downloadFile = (fileName: string, content: string, mimeType: string) => {
      const blob = new Blob([content], { type: mimeType });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setStatusBarMessage(`Downloading ${fileName}`, 'success');
  };

  const handleDownload = (log: UsageLog) => {
    if (!currentUserData) {
        setStatusBarMessage('User data not available for download.', 'error');
        return;
    }

    try {
        if ((log.toolName === 'Journal Compliance Checker' || log.toolName === 'Book Compliance Checker') && log.outputId) {
            const folders = log.toolName === 'Journal Compliance Checker' 
                ? currentUserData.journalComplianceFolders 
                : currentUserData.bookComplianceFolders;
            const manuscript = folders.flatMap(f => f.manuscripts).find(m => m.id === log.outputId);
            
            if (manuscript) {
                const fileName = `${manuscript.name}_report.csv`;
                let csvContent = `File Name,${escapeCsvField(manuscript.name)}\nStatus,${escapeCsvField(manuscript.status)}\n\n`;

                if (manuscript.complianceReport && manuscript.complianceReport.length > 0) {
                    csvContent += '## COMPLIANCE REPORT ##\n';
                    csvContent += 'Status,Category,Summary,Manuscript Quote,Manuscript Page,Rule Content,Rule Page,Recommendation\n';
                    manuscript.complianceReport.forEach(f => {
                        csvContent += [f.status, f.checkCategory, f.summary, f.manuscriptQuote, f.manuscriptPage, f.ruleContent, f.rulePage, f.recommendation].map(escapeCsvField).join(',') + '\n';
                    });
                    csvContent += '\n';
                }

                if (manuscript.analysisReport && manuscript.analysisReport.length > 0) {
                    csvContent += '## MANUSCRIPT ANALYSIS REPORT ##\n';
                    csvContent += 'Priority,Category,Summary,Quote,Page Number,Recommendation\n';
                    manuscript.analysisReport.forEach(f => {
                        csvContent += [f.priority, f.issueCategory, f.summary, f.quote, f.pageNumber, f.recommendation].map(escapeCsvField).join(',') + '\n';
                    });
                    csvContent += '\n';
                }
                
                if (log.toolName === 'Journal Compliance Checker' && manuscript.journalRecommendations && manuscript.journalRecommendations.length > 0) {
                    csvContent += '## JOURNAL RECOMMENDATIONS ##\n';
                    csvContent += 'Journal Name,Publisher,ISSN,Field,Reasoning\n';
                    manuscript.journalRecommendations.forEach(rec => {
                       csvContent += [rec.journalName, rec.publisher, rec.issn, rec.field, rec.reasoning].map(escapeCsvField).join(',') + '\n';
                    });
                     csvContent += '\n';
                }

                if (log.toolName === 'Journal Compliance Checker' && manuscript.scores) {
                    csvContent += '## SCORING REPORT ##\n';
                    csvContent += 'Metric,Score,Reasoning\n';
                    for (const [key, value] of Object.entries(manuscript.scores)) {
                        const scoreName = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
                        csvContent += [scoreName, value.score, value.reasoning].map(escapeCsvField).join(',') + '\n';
                    }
                    csvContent += '\n';
                }
                
                if (log.toolName === 'Book Compliance Checker' && manuscript.structuralReport && manuscript.structuralReport.length > 0) {
                    csvContent += '## BOOK STRUCTURAL ANALYSIS REPORT ##\n';
                    csvContent += 'Priority,Category,Location,Summary,Details,Recommendation\n';
                    manuscript.structuralReport.forEach(f => {
                        csvContent += [f.priority, f.issueCategory, f.location, f.summary, f.details, f.recommendation].map(escapeCsvField).join(',') + '\n';
                    });
                    csvContent += '\n';
                }

                if (log.toolName === 'Book Compliance Checker' && manuscript.readabilityReport && manuscript.readabilityReport.length > 0) {
                    csvContent += '## READABILITY ANALYSIS REPORT ##\n';
                    csvContent += 'Priority,Category,Location,Summary,Details,Quote,Recommendation\n';
                    manuscript.readabilityReport.forEach(f => {
                        csvContent += [f.priority, f.issueCategory, f.location, f.summary, f.details, f.quote, f.recommendation].map(escapeCsvField).join(',') + '\n';
                    });
                    csvContent += '\n';
                }

                downloadFile(fileName, csvContent, 'text/csv;charset=utf-8');
            } else { throw new Error('Could not find the original manuscript data for the report.'); }
        } else if (log.toolName.startsWith('PDF Asset Analyzer') && log.outputId) {
            const pdfFile = currentUserData.metadataFolders.flatMap(f => f.pdfFiles).find(p => p.id === log.outputId);
            if (pdfFile) {
                const fileName = `${pdfFile.name}_metadata.csv`;
                let csvContent = "Filename,Asset ID,Asset Type,Page Number,Alt Text,Keywords,Taxonomy\n";
                (pdfFile.assets || []).forEach(asset => {
                    csvContent += [pdfFile.name, asset.assetId, asset.assetType, asset.pageNumber, asset.altText, (asset.keywords || []).join(', '), asset.taxonomy].map(escapeCsvField).join(',') + '\n';
                });
                downloadFile(fileName, csvContent, 'text/csv;charset=utf-8');
            } else { throw new Error('Could not find the original PDF data.'); }
        } else if (log.toolName === 'Image Metadata Generator' && log.reportData) {
            const fileName = "image_metadata_export.csv";
            let csvContent = "Filename,Asset ID,Asset Type,Alt Text,Keywords,Taxonomy\n";
            (log.reportData as any[]).forEach(assetResult => {
                const { fileName: imgFileName, metadata } = assetResult;
                if (!metadata) return;
                csvContent += [imgFileName, metadata.assetId, metadata.assetType, metadata.altText, (metadata.keywords || []).join(', '), metadata.taxonomy].map(escapeCsvField).join(',') + '\n';
            });
            downloadFile(fileName, csvContent, 'text/csv;charset=utf-8');
        } else {
            throw new Error('No downloadable report available for this entry.');
        }
    } catch (error) {
        setStatusBarMessage(error instanceof Error ? error.message : 'An unknown error occurred.', 'error');
    }
  };

  const isDownloadable = (log: UsageLog): boolean => {
      if ((log.toolName === 'Journal Compliance Checker' || log.toolName === 'Book Compliance Checker') && log.outputId) return true;
      if (log.toolName === 'Manuscript Analyzer' && log.outputId) return true;
      if (log.toolName.startsWith('PDF Asset Analyzer') && log.outputId) return true;
      if (log.toolName === 'Image Metadata Generator' && log.reportData) return true;
      return false;
  };

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Usage Dashboard</h2>
        <p className="text-slate-500 mt-1">Monitor your token consumption and recent activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Tokens Used</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{currentUser?.tokensUsed.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Token Cap</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{currentUser?.tokenCap.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Tokens Remaining</h3>
          <p className="text-3xl font-bold text-sky-500 mt-1">{tokensRemaining.toLocaleString()}</p>
        </div>
      </div>
      
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
        <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Consumption Overview</h3>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-4">
            <div
                className={`h-4 rounded-full text-center text-white text-xs transition-all duration-500 ${percentageUsed > 85 ? 'bg-red-500' : percentageUsed > 60 ? 'bg-yellow-500' : 'bg-sky-500'}`}
                style={{ width: `${percentageUsed}%` }}
            >
                {Math.round(percentageUsed)}%
            </div>
        </div>
        {percentageUsed >= 100 && (
            <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 rounded">
                <p className="font-bold">Token Cap Reached</p>
                <p>You have used all your available tokens. Please contact an administrator to top up your account.</p>
            </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
        <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Usage by Day</h3>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128, 128, 128, 0.2)" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(31, 41, 55, 0.8)',
                  borderColor: 'rgba(75, 85, 99, 0.8)'
                }}
                itemStyle={{ color: '#E5E7EB' }}
                labelStyle={{ color: 'white', fontWeight: 'bold' }}
              />
              <Legend />
              <Bar dataKey="tokens" stackId="a" fill="#0ea5e9" name="Total Tokens" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md">
        <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Usage Log</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Tool Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">File / Job</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Prompt Tokens</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Response Tokens</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Total</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {userLogs.map(log => (
                <tr key={log.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{log.toolName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300 max-w-xs truncate" title={log.outputName}>{log.outputName || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{log.promptTokens.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-300">{log.responseTokens.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-100">{(log.promptTokens + log.responseTokens).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                     <button
                        onClick={() => handleDownload(log)}
                        disabled={!isDownloadable(log)}
                        className="p-1.5 rounded-full text-slate-500 disabled:text-slate-300 dark:disabled:text-slate-600 disabled:cursor-not-allowed enabled:hover:bg-slate-200 dark:enabled:hover:bg-slate-700"
                        title={isDownloadable(log) ? "Download Report" : "No report available"}
                     >
                        <DownloadIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
               {userLogs.length === 0 && (
                <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">No usage logs for this period.</td>
                </tr>
                )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
