'use client';

import React, { useState } from 'react';
import { Loader2, AlertTriangle, AlertCircle, AlertOctagon } from 'lucide-react';
import { getCookieValue } from '@/utils/cookies';
import { SaveButton } from '@ui';
import toast from 'react-hot-toast';

interface RiskTabProps {
  documentId: string;
  selectedText?: string;
  hasAccess: boolean;
  signingToken?: string;
  recipientId?: string;
}

type RiskSeverity = 'low' | 'medium' | 'high' | string;

interface RiskItem {
  severity: RiskSeverity;
  category: string;
  description: string;
  recommendation?: string;
}

interface RiskAnalysisResult {
  overallRiskLevel: RiskSeverity;
  risks: RiskItem[];
}

const buildAIHeaders = (csrfToken: string | null, signingToken?: string, recipientId?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  ...(signingToken ? { 'X-Signing-Token': signingToken } : {}),
  ...(recipientId ? { 'X-Recipient-Id': recipientId } : {}),
});

const RiskTab: React.FC<RiskTabProps> = ({
  documentId,
  selectedText,
  hasAccess,
  signingToken,
  recipientId,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RiskAnalysisResult | null>(null);
  const [error, setError] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleAnalyzeRisk = async () => {
    if (!selectedText) {
      setError('Please select text from the document');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const csrfToken = getCookieValue('csrf_token');
      const response = await fetch('/api/ai/analyze-risk', {
        method: 'POST',
        headers: buildAIHeaders(csrfToken, signingToken, recipientId),
        body: JSON.stringify({
          documentId,
          selectedText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to analyze risks');
      }

      const data = (await response.json()) as RiskAnalysisResult;
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze risks';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high':
        return <AlertOctagon size={16} />;
      case 'medium':
        return <AlertTriangle size={16} />;
      case 'low':
        return <AlertCircle size={16} />;
      default:
        return null;
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-4 text-center text-gray-600">
        <p>Upgrade to Business Plus to access risk analysis</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={handleAnalyzeRisk}
        disabled={loading || !selectedText}
        className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? 'Analyzing...' : 'Analyze Risks'}
      </button>

      {result && (
        <div className="space-y-4">
          <div className="bg-gray-50 p-3 rounded">
            <p className="text-sm font-medium text-gray-700">Overall Risk Level</p>
            <div className={`mt-2 px-3 py-2 rounded text-sm font-semibold inline-block ${getSeverityColor(result.overallRiskLevel)}`}>
              {result.overallRiskLevel.toUpperCase()}
            </div>
          </div>

          <div className="space-y-3">
            {result.risks && result.risks.length > 0 ? (
              result.risks.map((risk, idx) => (
                <div key={idx} className="border-l-4 border-gray-300 pl-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`px-2 py-1 rounded text-xs font-medium inline-flex items-center gap-1 ${getSeverityColor(risk.severity)}`}>
                      {getSeverityIcon(risk.severity)}
                      {risk.severity.toUpperCase()}
                    </div>
                    <p className="font-medium text-sm text-gray-800">{risk.category}</p>
                  </div>
                  <p className="text-sm text-gray-700">{risk.description}</p>
                  {risk.recommendation && (
                    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                      <p className="font-medium">Recommendation:</p>
                      <p>{risk.recommendation}</p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-600 text-center py-4">No significant risks detected</p>
            )}
          </div>

          {!signingToken && (
            <SaveButton
              onClick={async () => {
                setSaving(true);
                const csrfToken = getCookieValue('csrf_token');
                try {
                  const response = await fetch('/api/ai/save-insight', {
                    method: 'POST',
                    headers: buildAIHeaders(csrfToken, signingToken, recipientId),
                    body: JSON.stringify({
                      documentId,
                      type: 'risk_analysis',
                      content: JSON.stringify(result),
                      selectedText,
                    }),
                  });
                  if (!response.ok) throw new Error('Unable to save analysis');
                  toast.success('Analysis saved to document notes');
                } catch (saveError) {
                  toast.error(saveError instanceof Error ? saveError.message : 'Unable to save analysis');
                } finally {
                  setSaving(false);
                }
              }}
              saving={saving}
              label="Save analysis"
              className="w-full"
            />
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default RiskTab;
