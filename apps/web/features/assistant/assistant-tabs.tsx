'use client';

import { useState } from 'react';

import { cn } from '@kit/ui/utils';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { AssistantChat } from '../chat/assistant-chat';

import { DocumentsPanel } from './documents-panel';

type TabId = 'chat' | 'documents';

/**
 * Tabs của trang Trợ lý: Đoạn chat (T009) và Tài liệu (T010).
 */
export function AssistantTabs() {
  const [tab, setTab] = useState<TabId>('chat');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(
          [
            { id: 'chat', label: 'Đoạn chat' },
            { id: 'documents', label: 'Tài liệu' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'chat' ? (
        <AssistantChat />
      ) : (
        <DocumentsPanel />
      )}
    </div>
  );
}
