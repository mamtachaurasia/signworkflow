'use client';

import React from 'react';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    nodes.push(
      <strong key={`${match.index}-${match[0]}`} className="font-semibold text-gray-900">
        {match[1]}
      </strong>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

const MarkdownText: React.FC<MarkdownTextProps> = ({ content, className }) => {
  const lines = content.split('\n');

  return (
    <div className={className}>
      {lines.map((line, index) => (
        <React.Fragment key={index}>
          {renderInlineMarkdown(line)}
          {index < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  );
};

export default MarkdownText;
