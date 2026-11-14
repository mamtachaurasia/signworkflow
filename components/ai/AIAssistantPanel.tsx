'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, FileText, Languages, MessageSquareText, ShieldAlert, type LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import SummaryTab from './tabs/SummaryTab';
import TranslateTab from './tabs/TranslateTab';
import ExplainTab from './tabs/ExplainTab';
import RiskTab from './tabs/RiskTab';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { Button } from '@ui';

interface AIAssistantPanelProps {
  documentId: string;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
  requestedTab?: ActiveTab;
  requestKey?: number;
  isRecipientMode?: boolean;
  signingToken?: string;
  recipientId?: string;
}

type ActiveTab = 'summary' | 'translate' | 'explain' | 'risk';

type AITabAccess = Record<ActiveTab, boolean>;

const isActiveTab = (value: string | null): value is ActiveTab =>
  value !== null && ['summary', 'translate', 'explain', 'risk'].includes(value);

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  documentId,
  isOpen,
  onToggle,
  requestedTab,
  requestKey,
  isRecipientMode = false,
  signingToken,
  recipientId,
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [recipientAccess, setRecipientAccess] = useState<AITabAccess | null>(null);
  const [recipientAccessLoading, setRecipientAccessLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === 'undefined') return 'summary';
    const storedTab = localStorage.getItem('ai_active_tab');
    return isActiveTab(storedTab) ? storedTab : 'summary';
  });
  const { status: subscriptionStatus, loading: subscriptionLoading } = useSubscriptionStatus({
    enabled: isOpen && !isRecipientMode,
  });
  const hasAccess: AITabAccess = isRecipientMode
    ? recipientAccess || {
        summary: true,
        translate: false,
        explain: false,
        risk: false,
      }
    : {
        summary: subscriptionLoading
          ? true
          : subscriptionStatus.entitlements.aiSelectionSummary || subscriptionStatus.entitlements.aiFullDocument,
        translate: subscriptionLoading ? true : subscriptionStatus.entitlements.aiTranslation,
        explain: subscriptionLoading ? true : subscriptionStatus.entitlements.aiExplanation,
        risk: subscriptionLoading ? true : subscriptionStatus.entitlements.aiRiskAnalysis,
      };

  useEffect(() => {
    if (!isOpen || !isRecipientMode || !signingToken || !documentId) {
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setRecipientAccess(null);
      setRecipientAccessLoading(true);
    });

    fetch(`/api/ai/recipient-entitlements?documentId=${encodeURIComponent(documentId)}`, {
      method: 'GET',
      headers: {
        'X-Signing-Token': signingToken,
        ...(recipientId ? { 'X-Recipient-Id': recipientId } : {}),
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.message || 'Failed to load AI access');
        }

        const entitlements = data.entitlements || {};
        setRecipientAccess({
          summary: Boolean(entitlements.aiSelectionSummary || entitlements.aiFullDocument),
          translate: Boolean(entitlements.aiTranslation),
          explain: Boolean(entitlements.aiExplanation),
          risk: Boolean(entitlements.aiRiskAnalysis),
        });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setRecipientAccess({
          summary: false,
          translate: false,
          explain: false,
          risk: false,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRecipientAccessLoading(false);
        }
      });

    return () => controller.abort();
  }, [documentId, isOpen, isRecipientMode, recipientId, signingToken]);

  useEffect(() => {
    localStorage.setItem('ai_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen || !requestedTab) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setActiveTab(requestedTab);
    });
    return () => {
      active = false;
    };
  }, [isOpen, requestedTab, requestKey]);

  useEffect(() => {
    if (!isRecipientMode || recipientAccessLoading || !recipientAccess || recipientAccess[activeTab]) {
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setActiveTab('summary');
    });
    return () => {
      active = false;
    };
  }, [activeTab, isRecipientMode, recipientAccess, recipientAccessLoading]);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection()?.toString();
      if (selection && selection.length > 10) {
        setSelectedText(selection);
      }
    };

    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, []);

  const tabs: Array<{ id: ActiveTab; label: string; title: string; icon: LucideIcon }> = [
    { id: 'summary', label: 'Summarize', title: 'Summarize document or selected text', icon: FileText },
    { id: 'translate', label: 'Translate', title: 'Translate document or selected text', icon: Languages },
    { id: 'explain', label: 'Explain Clause', title: 'Explain selected clause in plain language', icon: MessageSquareText },
    { id: 'risk', label: 'Analyze Risks', title: 'Analyze selected text for legal risks', icon: ShieldAlert },
  ];
  const visibleTabs = isRecipientMode ? tabs.filter((tab) => hasAccess[tab.id]) : tabs;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-white border-l border-gray-200 shadow-lg z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">AI Assistant</h2>
              <button
                onClick={() => onToggle(false)}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
              >
                <ChevronRight size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-2 border-b border-gray-200 bg-gray-50 overflow-x-auto">
              {visibleTabs.map((tab) => (
                (() => {
                  const Icon = tab.icon;
                  return (
                    <Button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      title={tab.title}
                      aria-label={tab.title}
                      className={`items-center flex-col gap-0! h-12! text-xs ${
                        activeTab === tab.id
                          ? 'bg-white text-gray-900 border-b-2 border-blue-500'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      inverted
                      icon={<Icon size={15} />}
                    >
                   
                      {tab.label}
                    </Button>
                  );
                })()
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'summary' && (
                <SummaryTab
                  documentId={documentId}
                  selectedText={selectedText}
                  hasAccess={hasAccess.summary}
                  signingToken={signingToken}
                  recipientId={recipientId}
                />
              )}
              {activeTab === 'translate' && (
                <TranslateTab
                  documentId={documentId}
                  selectedText={selectedText}
                  hasAccess={hasAccess.translate}
                  signingToken={signingToken}
                  recipientId={recipientId}
                />
              )}
              {activeTab === 'explain' && (
                <ExplainTab
                  documentId={documentId}
                  selectedText={selectedText}
                  hasAccess={hasAccess.explain}
                  signingToken={signingToken}
                  recipientId={recipientId}
                />
              )}
              {activeTab === 'risk' && (
                <RiskTab
                  documentId={documentId}
                  selectedText={selectedText}
                  hasAccess={hasAccess.risk}
                  signingToken={signingToken}
                  recipientId={recipientId}
                />
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 p-3 text-xs text-gray-500 text-center">
              <p>Select text in the document to analyze</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button */}
      {!isOpen && (
        <motion.button
          initial={{ x: 0, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => onToggle(true)}
          className="fixed right-4 bottom-4 z-40 p-3 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 transition-colors"
          title="Open AI Assistant"
        >
          <ChevronLeft size={24} />
        </motion.button>
      )}
    </>
  );
};

export default AIAssistantPanel;
