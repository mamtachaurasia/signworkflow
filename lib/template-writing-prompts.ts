import type { WritingAssistMode } from '@/lib/modules/ai/ai-provider.interface';

export type DocumentWritingPrompt = {
  id: string;
  label: string;
  instruction: string;
  mode: WritingAssistMode;
};

export type DocumentWritingPromptSet = {
  contextLabel: string | null;
  prompts: DocumentWritingPrompt[];
};

type PromptTopic = {
  id: string;
  label: string;
  pattern: RegExp;
  prompt: Omit<DocumentWritingPrompt, 'id'>;
};

const TOPICS: PromptTopic[] = [
  {
    id: 'confidentiality',
    label: 'confidentiality',
    pattern: /\b(confidential(?:ity)?|non[-\s]?disclosure|nda)\b/i,
    prompt: {
      label: 'Clarify confidentiality',
      instruction: 'Can you make the confidentiality obligations clearer while preserving the scope, exclusions, duration, and all defined terms?',
      mode: 'plain_language',
    },
  },
  {
    id: 'payment',
    label: 'payment terms',
    pattern: /\b(payment|payments|invoice|invoic|fee|fees|price|pricing|compensation|late fee|net\s*\d+)\b/i,
    prompt: {
      label: 'Clarify payment terms',
      instruction: 'Can you clarify the payment, invoicing, and timing terms without changing any amounts, dates, obligations, or defined terms?',
      mode: 'plain_language',
    },
  },
  {
    id: 'termination',
    label: 'termination',
    pattern: /\b(term(?:ination)?|terminate|termination|renewal|renew|expire|expiration)\b/i,
    prompt: {
      label: 'Clarify term & termination',
      instruction: 'Can you make the term, renewal, notice, and termination language clearer without changing the parties’ rights or deadlines?',
      mode: 'rewrite',
    },
  },
  {
    id: 'liability',
    label: 'liability',
    pattern: /\b(indemnif|liabilit|damages|hold harmless|limitation of liability)\b/i,
    prompt: {
      label: 'Polish liability language',
      instruction: 'Can you improve the clarity and professional tone of this liability or indemnity language without changing its legal allocation of risk?',
      mode: 'professional',
    },
  },
  {
    id: 'privacy',
    label: 'data protection',
    pattern: /\b(personal data|data protection|privacy|gdpr|security|confidential information)\b/i,
    prompt: {
      label: 'Clarify data protection',
      instruction: 'Can you make the privacy, data protection, and security obligations easier to understand without adding or removing compliance commitments?',
      mode: 'plain_language',
    },
  },
  {
    id: 'intellectual-property',
    label: 'intellectual property',
    pattern: /\b(intellectual property|copyright|trademark|license|licence|proprietary)\b/i,
    prompt: {
      label: 'Clarify IP ownership',
      instruction: 'Can you clarify the intellectual-property ownership and license terms while preserving all rights, restrictions, and defined terms?',
      mode: 'rewrite',
    },
  },
  {
    id: 'services',
    label: 'services and deliverables',
    pattern: /\b(service|services|scope|deliverable|deliverables|statement of work|sow)\b/i,
    prompt: {
      label: 'Clarify scope & deliverables',
      instruction: 'Can you make the scope, deliverables, and responsibilities more precise without changing what either party must provide?',
      mode: 'professional',
    },
  },
  {
    id: 'employment',
    label: 'employment terms',
    pattern: /\b(employee|employment|employer|salary|benefit|benefits|position|job title)\b/i,
    prompt: {
      label: 'Clarify employment terms',
      instruction: 'Can you make these employment terms easier to understand while preserving compensation, obligations, and any conditions?',
      mode: 'plain_language',
    },
  },
];

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function sourceNoun(selectedText: string, sectionText: string): string {
  return hasText(selectedText) ? 'selected language' : hasText(sectionText) ? 'this section' : 'this agreement';
}

export function getDocumentWritingPrompts({
  documentName = '',
  documentText = '',
  sectionText = '',
  selectedText = '',
}: {
  documentName?: string;
  documentText?: string;
  sectionText?: string;
  selectedText?: string;
}): DocumentWritingPromptSet {
  const localContext = `${selectedText}\n${sectionText}`;
  const documentContext = `${documentName}\n${documentText}`;
  const source = sourceNoun(selectedText, sectionText);
  const hasSource = hasText(selectedText) || hasText(sectionText);

  const matches = TOPICS
    .map((topic) => ({
      topic,
      score: Number(topic.pattern.test(localContext)) * 2 + Number(topic.pattern.test(documentContext)),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map(({ topic }) => ({ id: topic.id, ...topic.prompt, topicLabel: topic.label }));

  const genericPrompts: DocumentWritingPrompt[] = hasSource
    ? [
        {
          id: 'clearer',
          label: 'Make it clearer',
          instruction: `Can you make ${source} clearer and more readable while preserving every obligation, deadline, defined term, and existing template variable?`,
          mode: 'rewrite',
        },
        {
          id: 'shorter',
          label: 'Make it shorter',
          instruction: `Can you shorten ${source} without removing or weakening any material right, obligation, exception, deadline, defined term, or existing template variable?`,
          mode: 'concise',
        },
        {
          id: 'grammar',
          label: 'Fix grammar only',
          instruction: `Can you fix grammar, spelling, and punctuation in ${source} without changing its legal meaning or existing template variables?`,
          mode: 'grammar',
        },
      ]
    : [
        {
          id: 'draft-clause',
          label: 'Draft a new clause',
          instruction: 'Can you draft a concise clause that matches the tone and terminology of this agreement? Please do not invent party-specific facts, dates, or amounts.',
          mode: 'draft',
        },
        {
          id: 'draft-obligations',
          label: 'Draft clear obligations',
          instruction: 'Can you draft a clear obligations clause that fits this agreement? Use Smart variables for names, dates, amounts, addresses, and other details that should be entered later. Use lowercase snake_case names inside double braces, such as {{party_name}}.',
          mode: 'draft',
        },
      ];

  const topicPrompts = matches.map(({ id, label, instruction, mode, topicLabel }) => hasSource
    ? { id, label, instruction, mode }
    : {
        id: `draft-${id}`,
        label: `Draft ${topicLabel} clause`,
        instruction: `Can you draft a concise ${topicLabel} clause that matches this agreement’s tone and terminology? Do not invent party-specific facts, dates, amounts, or legal requirements.`,
        mode: 'draft' as const,
      });
  const prompts = [...topicPrompts, ...genericPrompts]
    .filter((prompt, index, all) => all.findIndex((candidate) => candidate.id === prompt.id) === index)
    .slice(0, 4);
  const contextLabel = matches.length > 0
    ? `Tailored to ${matches.map(({ topicLabel }) => topicLabel).join(' and ')} in this agreement`
    : null;

  return { contextLabel, prompts };
}
