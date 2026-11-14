'use client';

import React, { useState } from 'react';
import AIResultCard from '../AIResultCard';
import { Loader2 } from 'lucide-react';
import { getCookieValue } from '@/utils/cookies';

interface TranslateTabProps {
  documentId: string;
  selectedText?: string;
  hasAccess: boolean;
  signingToken?: string;
  recipientId?: string;
}

const LANGUAGES = [
  { code: 'english', label: 'English' },
  { code: 'hindi', label: 'Hindi' },
  { code: 'spanish', label: 'Spanish' },
  { code: 'french', label: 'French' },
  { code: 'german', label: 'German' },
  { code: 'arabic', label: 'Arabic' },
  { code: 'japanese', label: 'Japanese' },
  { code: 'chinese', label: 'Chinese' },
];

const buildAIHeaders = (csrfToken: string | null, signingToken?: string, recipientId?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  ...(signingToken ? { 'X-Signing-Token': signingToken } : {}),
  ...(recipientId ? { 'X-Recipient-Id': recipientId } : {}),
});

const TranslateTab: React.FC<TranslateTabProps> = ({
  documentId,
  selectedText,
  hasAccess,
  signingToken,
  recipientId,
}) => {
  const [mode, setMode] = useState<'selection' | 'full'>('selection');
  const [targetLanguage, setTargetLanguage] = useState('hindi');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleTranslate = async () => {
    if (!selectedText && mode === 'selection') {
      setError('Please select text from the document');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');

    try {
      const csrfToken = getCookieValue('csrf_token');
      const endpoint = mode === 'selection'
        ? '/api/ai/translate-selection'
        : '/api/ai/translate-document';

      const body = mode === 'selection'
        ? {
            documentId,
            selectedText,
            targetLanguage,
            pageNumber: 1,
          }
        : {
            documentId,
            targetLanguage,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: buildAIHeaders(csrfToken, signingToken, recipientId),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to translate');
      }

      if (mode === 'selection') {
        const data = await response.json();
        setResult(data.translation);
      } else {
        const reader = response.body?.getReader();
        let translations = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = new TextDecoder().decode(value);
            const lines = text.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'chunk') {
                    translations += data.translation + '\n\n';
                    setResult(translations);
                  } else if (data.type === 'complete') {
                    setResult(data.fullTranslation);
                  }
                } catch {
                  // Ignore JSON parse errors
                }
              }
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to translate';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-4 text-center text-gray-600">
        <p>Upgrade to Business Plus to access AI translation</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setMode('selection')}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            mode === 'selection'
              ? 'bg-green-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Selection
        </button>
        <button
          onClick={() => setMode('full')}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            mode === 'full'
              ? 'bg-green-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Full Document
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Target Language</label>
        <select
          value={targetLanguage}
          onChange={(e) => setTargetLanguage(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleTranslate}
        disabled={loading || (mode === 'selection' && !selectedText)}
        className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? 'Translating...' : 'Translate'}
      </button>

      {result && (
        <AIResultCard
          type="translation"
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
                type: 'translation',
                content: result,
                language: targetLanguage,
                selectedText: mode === 'selection' ? selectedText : undefined,
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

export default TranslateTab;
