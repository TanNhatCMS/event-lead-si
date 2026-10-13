'use client';

import { useMemo } from 'react';

/** Escape HTML để nội dung từ AI không bao giờ inject được thẻ thật. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Inline formatting: `code`, **bold**, *italic*, [text](url). Chạy trên text đã escape. */
function renderInline(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(
    /`([^`\n]+)`/g,
    '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">$1</code>',
  );
  html = html.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold">$1</strong>',
  );
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline text-primary">$1</a>',
  );

  return html;
}

function renderBlocks(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushList = () => {
    if (listItems.length > 0) {
      const tag = listOrdered ? 'ol' : 'ul';
      const cls = listOrdered
        ? 'list-decimal space-y-1 pl-5'
        : 'list-disc space-y-1 pl-5';
      out.push(
        `<${tag} class="${cls}">${listItems.map((li) => `<li>${li}</li>`).join('')}</${tag}>`,
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (inCode) {
        out.push(
          `<pre class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[0.85em]"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
        );
        codeLines = [];
        inCode = false;
      } else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = (heading[1] ?? '#').length;
      const sizes = [
        'text-lg font-semibold mt-3 mb-1',
        'text-base font-semibold mt-3 mb-1',
        'text-sm font-semibold mt-2 mb-1',
        'text-sm font-semibold mt-2 mb-1',
      ];
      out.push(
        `<div class="${sizes[level - 1]}">${renderInline(heading[2] ?? '')}</div>`,
      );
      continue;
    }

    const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
    const olMatch = trimmed.match(/^\d+[.)]\s+(.*)$/);
    const listMatch = ulMatch ?? olMatch;
    if (listMatch) {
      const ordered = Boolean(olMatch);
      if (listItems.length > 0 && ordered !== listOrdered) {
        flushList();
      }
      listOrdered = ordered;
      listItems.push(renderInline(listMatch[1] ?? ''));
      continue;
    }

    if (line.trimStart().startsWith('>')) {
      flushList();
      const quote = line.trimStart().replace(/^>\s?/, '');
      out.push(
        `<blockquote class="border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground">${renderInline(quote)}</blockquote>`,
      );
      continue;
    }

    if (trimmed === '') {
      flushList();
      continue;
    }

    flushList();
    out.push(`<p class="my-1.5">${renderInline(trimmed)}</p>`);
  }

  if (inCode) {
    out.push(
      `<pre class="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[0.85em]"><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
    );
  }
  flushList();

  return out.join('\n');
}

/** Render markdown cơ bản (không cần thư viện ngoài), an toàn XSS. */
export function BasicMarkdown({ text }: { text: string }) {
  const html = useMemo(() => renderBlocks(text), [text]);
  return (
    <div
      className="markdown-body text-sm leading-relaxed"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
