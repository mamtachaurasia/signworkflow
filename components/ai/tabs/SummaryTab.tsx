'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AIResultCard from '../AIResultCard';
import MarkdownText from '../MarkdownText';
import { ChevronDown, Copy, Loader2, NotebookText, RefreshCw, Trash2 } from 'lucide-react';
import { getCookieValue } from '@/utils/cookies';
import toast from 'react-hot-toast';

interface SummaryTabProps {
  documentId: string;
  selectedText?: string;
  hasAccess: boolean;
  signingToken?: string;
  recipientId?: string;
}

type DocumentNote = {
  _id: string;
  type: 'summary';
  content: string;
  contentPreview?: string;
  selectedTextPreview?: string;
  createdAt: string;
  savedBy: string;
};

const buildAIHeaders = (csrfToken: string | null, signingToken?: string, recipientId?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
  ...(signingToken ? { 'X-Signing-Token': signingToken } : {}),
  ...(recipientId ? { 'X-Recipient-Id': recipientId } : {}),
});

const SummaryTab: React.FC<SummaryTabProps> = ({
  documentId,
  selectedText,
  hasAccess,
  signingToken,
  recipientId,
}) => {
  const canUseDocumentNotes = !signingToken;
  const [mode, setMode] = useState<'selection' | 'full'>('full');
  const [language, setLanguage] = useState<string>('English');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [notes, setNotes] = useState<DocumentNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState('');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!documentId || !canUseDocumentNotes) return;

    setNotesLoading(true);
    setNotesError('');

    try {
      const response = await fetch(`/api/ai/history/${encodeURIComponent(documentId)}?type=summary&limit=20`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to load document notes');
      }

      setNotes(Array.isArray(data.insights) ? data.insights : []);
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Failed to load document notes');
    } finally {
      setNotesLoading(false);
    }
  }, [canUseDocumentNotes, documentId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const saveAsDocumentNote = async () => {
    if (!result) return;

    const csrfToken = getCookieValue('csrf_token');
    const response = await fetch('/api/ai/save-insight', {
      method: 'POST',
      headers: buildAIHeaders(csrfToken, signingToken, recipientId),
      body: JSON.stringify({
        documentId,
        type: 'summary',
        content: result,
        language,
        selectedText: mode === 'selection' ? selectedText : undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to save document note');
    }

    await loadNotes();
  };

  const deleteDocumentNote = async (noteId: string) => {
    const confirmed = window.confirm('Delete this document note?');
    if (!confirmed) return;

    setDeletingNoteId(noteId);
    setNotesError('');

    try {
      const csrfToken = getCookieValue('csrf_token');
      const response = await fetch(`/api/ai/insights/${encodeURIComponent(noteId)}`, {
        method: 'DELETE',
        headers: buildAIHeaders(csrfToken, signingToken, recipientId),
        body: JSON.stringify({ documentId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to delete document note');
      }

      setNotes((prev) => prev.filter((note) => note._id !== noteId));
      if (expandedNoteId === noteId) {
        setExpandedNoteId(null);
      }
      toast.success('Deleted note');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete document note';
      setNotesError(message);
      toast.error(message);
    } finally {
      setDeletingNoteId(null);
    }
  };

  const handleSummarize = async () => {
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
        ? '/api/ai/summarize-selection'
        : '/api/ai/summarize-document';

      const body = mode === 'selection'
        ? {
            documentId,
            selectedText,
            language,
            pageNumber: 1,
          }
        : {
            documentId,
            language,
            maxLength: 1000,
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: buildAIHeaders(csrfToken, signingToken, recipientId),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to generate summary');
      }

      if (mode === 'selection') {
        const data = await response.json();
        setResult(data.summary);
      } else {
        // Stream handling for full document
        const reader = response.body?.getReader();
        let summaries = '';

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
                    summaries += data.summary + '\n\n';
                    setResult(summaries);
                  } else if (data.type === 'complete') {
                    setResult(data.fullSummary);
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
      const message = err instanceof Error ? err.message : 'Failed to generate summary';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="p-4 text-center text-gray-600">
        <p>Upgrade to Business plan to access AI summarization</p>
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
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Selection
        </button>
        <button
          onClick={() => setMode('full')}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
            mode === 'full'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Full Document
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option>English</option>
          <option>Hindi</option>
          <option>Spanish</option>
          <option>French</option>
          <option>German</option>
          <option>Arabic</option>
          <option>Japanese</option>
          <option>Chinese</option>
        </select>
      </div>

      <button
        onClick={handleSummarize}
        disabled={loading || (mode === 'selection' && !selectedText)}
        className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <Loader2 size={16} className="animate-spin" />}
        {loading ? 'Summarizing...' : 'Summarize'}
      </button>

      {result && (
        <AIResultCard
          type="summary"
          content={result}
          selectedText={selectedText}
          onCopy={() => navigator.clipboard.writeText(result)}
          onSave={canUseDocumentNotes ? saveAsDocumentNote : undefined}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {canUseDocumentNotes && (
      <div className="border-t border-gray-200 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <NotebookText size={17} className="text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Document Notes</h3>
          </div>
          <button
            type="button"
            onClick={loadNotes}
            disabled={notesLoading}
            title="Refresh document notes"
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            <RefreshCw size={15} className={notesLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {notesError && (
          <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {notesError}
          </div>
        )}

        {!notesLoading && notes.length === 0 && (
          <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
            Saved summaries will appear here as document notes.
          </div>
        )}

        <div className="space-y-3">
          {notes.map((note) => {
            const isExpanded = expandedNoteId === note._id;
            const content = isExpanded ? note.content : note.contentPreview || note.content;
            const createdAt = new Date(note.createdAt);
            const createdLabel = Number.isNaN(createdAt.getTime())
              ? ''
              : createdAt.toLocaleString();

            return (
              <div key={note._id} className="rounded border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedNoteId(isExpanded ? null : note._id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-900">Saved summary</span>
                    {createdLabel && (
                      <span className="block text-xs text-gray-500">{createdLabel}</span>
                    )}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                <div className="border-t border-gray-100 px-3 py-3">
                  <MarkdownText
                    content={content}
                    className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-gray-700"
                  />
                  {note.selectedTextPreview && (
                    <p className="mt-2 text-xs text-gray-500">From selection: {note.selectedTextPreview}</p>
                  )}
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(note.content);
                        toast.success('Copied note');
                      }}
                      className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <Copy size={13} />
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteDocumentNote(note._id)}
                      disabled={deletingNoteId === note._id}
                      className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingNoteId === note._id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Trash2 size={13} />
                      )}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
};

export default SummaryTab;
