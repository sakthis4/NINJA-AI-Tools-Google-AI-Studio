import React from 'react';
import { ManuscriptScores } from '../types';

interface ScoreGaugeProps {
    score: number;
    label: string;
    isRisk?: boolean; // If true, colors are inverted (higher score is worse)
}

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, label, isRisk = false }) => {
    const clampedScore = Math.max(0, Math.min(100, score));
    const circumference = 2 * Math.PI * 45; // r = 45
    const offset = circumference - (clampedScore / 100) * circumference;

    let colorClass = 'stroke-green-500';
    if ((!isRisk && clampedScore < 50) || (isRisk && clampedScore > 50)) {
        colorClass = 'stroke-red-500';
    } else if ((!isRisk && clampedScore < 75) || (isRisk && clampedScore > 25)) {
        colorClass = 'stroke-yellow-500';
    }
    
    return (
        <div className="flex flex-col items-center p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="relative w-40 h-20">
                <svg className="w-full h-full" viewBox="0 0 100 50">
                    <path
                        d="M 5,50 A 45,45 0 1 1 95,50"
                        fill="none"
                        stroke="#4a5568" // gray-700
                        strokeWidth="10"
                        strokeLinecap="round"
                    />
                    <path
                        d="M 5,50 A 45,45 0 1 1 95,50"
                        fill="none"
                        className={`transition-all duration-1000 ease-out ${colorClass}`}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        style={{ transitionProperty: 'stroke-dashoffset' }}
                    />
                </svg>
                <div className="absolute bottom-0 w-full text-center">
                    <span className="text-3xl font-bold text-white">{clampedScore}</span>
                    <span className="text-lg text-slate-400">/100</span>
                </div>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-300 text-center">{label}</p>
        </div>
    );
};

interface ScoringDashboardProps {
  scores: ManuscriptScores;
}

const ScoringDashboard: React.FC<ScoringDashboardProps> = ({ scores }) => {
    return (
        <div className="p-4 bg-slate-900 rounded-lg">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <ScoreGauge score={scores.complianceScore.score} label="Compliance Score" />
                <ScoreGauge score={scores.scientificQualityScore.score} label="Scientific Quality" />
                <ScoreGauge score={scores.writingQualityScore.score} label="Writing Quality" />
                <ScoreGauge score={scores.citationMaturityScore.score} label="Citation Maturity" />
                <ScoreGauge score={scores.noveltyScore.score} label="Novelty Score" />
                <ScoreGauge score={scores.dataIntegrityRiskScore.score} label="Data Integrity Risk" isRisk />
                <ScoreGauge score={scores.editorAcceptanceLikelihood.score} label="Editor Acceptance" />
            </div>
            <div className="mt-6 space-y-4">
                {Object.entries(scores).map(([key, value]) => {
                    const val = value as { score: number; reasoning: string };
                    const formattedLabel = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                    return (
                        <div key={key} className="p-3 bg-slate-800/50 rounded-md">
                            <p className="font-semibold text-slate-200">{formattedLabel}: <span className="text-white">{val.score}</span></p>
                            <p className="text-sm text-slate-400 mt-1">{val.reasoning}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ScoringDashboard;