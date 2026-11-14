'use client';

import React, { useState } from 'react';
import AIResultCard from '../AIResultCard';
import { Loader2 } from 'lucide-react';
import { getCookieValue } from '@/utils/cookies';

interface ExplainTabProps {
  documentId: string;
  selectedText?: string;
  hasAccess: boolean;
  signingToken?: string;
  recipientId?: string;
}

const buildAIHeaders = (csrfToken: string | null, signingToken?: string, recipientId?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  ...(signingToken ? { 'X-Signing-Token': signingToken } : {}),
  ...(recipientId ? { 'X-Recipient-Id': recipientId } : {}),
});

const ExplainTab: React.FC<ExplainTabProps> = ({
  documentId,
  selectedText,
  hasAccess,
  signingToken,
  recipientId,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleExplain = async () => {
    if (!selectedText) {
      setError('Please select text from the document');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');

    try {
      const csrfToken = getCookieValue('csrf_token');
      const response = await fetch('/api/ai/explain-clause', {
        method: 'POST',
        headers: buildAIHeaders(csrfToken, signingToken, recipientId),
        body: JSON.stringify({
          documentId,
          selectedText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to explain clause');
      }

      const data = await response.json();
      setResult(data.explanation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to explain clause';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-4 text-center text-gray-600">
        <p>Upgrade to Business Plus to access AI explanations</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={handleExplain}
        disabled={loading || !selectedText}
        className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? 'Explaining...' : 'Explain Clause'}
      </button>

      {result && (
        <AIResultCard
          type="explanation"
          content={result}
          selectedText={selectedText}
          onCopy={() => navigator.clipboard.writeText(result)}
          onSave={signingToken ? undefined : () => {
            const csrfToken = getCookieValue('csrf_token');
            fetch('/api/ai/save-insight', {
              method: 'POST',
              headers: buildAIHeaders(csrfToken, signingToken, recipientId),
              body: JSON.stringify({
                documentId,
                type: 'explanation',
                content: result,
                selectedText,
              }),
            });
          }}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default ExplainTab;
