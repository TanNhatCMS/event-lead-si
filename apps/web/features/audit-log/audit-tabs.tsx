'use client';

import { useState } from 'react';

import { cn } from '@kit/ui/utils';

import { AuditLogList } from './audit-log-list';
import { TraceList } from './trace-list';

/**
 * Tabs của trang Nhật ký: Hành động (audit_logs) và Trace (OpenTelemetry spans).
 */
export function AuditTabs() {
  const [tab, setTab] = useState<'actions' | 'traces'>('actions');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(
          [
            { id: 'actions', label: 'Hành động' },
            { id: 'traces', label: 'Trace AI' },
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

      {tab === 'actions' ? <AuditLogList /> : <TraceList />}
    </div>
  );
}
