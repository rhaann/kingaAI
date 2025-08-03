"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="prose prose-sm max-w-none"
      components={{
        // This is where you can customize how specific elements are rendered.
        // For example, making links open in a new tab.
        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        // You can add more customizations for h1, p, code, etc. if needed.
      }}
    >
      {content}
    </ReactMarkdown>
  );
}