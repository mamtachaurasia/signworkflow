'use client';

import React from 'react';
import { Copy, RotateCcw, Download, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import MarkdownText from './MarkdownText';
import { SaveButton } from '@ui';

interface AIResultCardProps {
  type: 'summary' | 'translation' | 'explanation' | 'risk_analysis';
  content: string | React.ReactNode;
  selectedText?: string;
  loading?: boolean;
  error?: string;
  onCopy?: () => void;
  onSave?: () => void | Promise<void>;
  onRegenerate?: () => void;
  onExport?: () => void;
}

const AIResultCard: React.FC<AIResultCardProps> = ({
  type,
  content,
  loading = false,
  error,
  onCopy,
  onSave,
  onRegenerate,
  onExport,
}) => {
  const [expanded, setExpanded] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const typeConfig = {
    summary: { color: 'bg-blue-50', icon: '📋', label: 'Summary' },
    translation: { color: 'bg-green-50', icon: '🌐', label: 'Translation' },
    explanation: { color: 'bg-purple-50', icon: '💡', label: 'Explanation' },
    risk_analysis: { color: 'bg-red-50', icon: '⚠️', label: 'Risk Analysis' },
  };

  const config = typeConfig[type];

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
        <p className="text-red-700 font-semibold">Error</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="mt-3 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${config.color} border border-gray-200 p-4 rounded`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="text-lg">{config.icon}</div>
          <p className="font-semibold text-gray-700">{config.label}</p>
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-300 rounded animate-pulse" />
          <div className="h-4 bg-gray-300 rounded animate-pulse w-5/6" />
          <div className="h-4 bg-gray-300 rounded animate-pulse w-4/6" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${config.color} border border-gray-200 rounded overflow-hidden`}
    >
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className="text-lg">{config.icon}</div>
          <p className="font-semibold text-gray-700">{config.label}</p>
        </div>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} className="text-gray-600" />
        </motion.div>
      </div>

      {expanded && (
        <>
          <div className="border-t border-gray-300/50 px-4 py-3 max-h-80 overflow-y-auto text-sm text-gray-700">
            {typeof content === 'string' ? (
              <MarkdownText content={content} className="whitespace-pre-wrap" />
            ) : (
              content
            )}
          </div>

          <div className="border-t border-gray-300/50 px-4 py-3 flex gap-2 flex-wrap">
            {onCopy && (
              <button
                onClick={() => {
                  onCopy();
                  toast.success('Copied');
                }}
                className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm"
              >
                <Copy size={14} />
                Copy
              </button>
            )}

            {onSave && (
              <SaveButton
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSave();
                    toast.success('Saved to document notes');
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Failed to save';
                    toast.error(message);
                  } finally {
                    setSaving(false);
                  }
                }}
                saving={saving}
                label="Save to notes"
                size="xs"
              />
            )}

            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm"
              >
                <RotateCcw size={14} />
                Regenerate
              </button>
            )}

            {onExport && (
              <button
                onClick={onExport}
                className="flex items-center gap-1 px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 text-sm"
              >
                <Download size={14} />
                Export
              </button>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default AIResultCard;
