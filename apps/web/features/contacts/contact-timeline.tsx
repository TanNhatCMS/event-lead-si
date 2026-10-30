'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CircleAlert,
  History,
  MailCheck,
  ScanLine,
  Send,
  StickyNote,
  TrendingUp,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

interface TimelineEntry {
  kind: string;
  title: string;
  detail: string | null;
  at: string;
  meta?: Record<string, unknown>;
}

const KIND_ICONS: Record<string, typeof ScanLine> = {
  card_scan: ScanLine,
  note_meeting_note: StickyNote,
  note_need: CircleAlert,
  note_opportunity: TrendingUp,
  note_next_step: ArrowRight,
  follow_up: Send,
  follow_up_sent: MailCheck,
  audit: History,
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/**
 * Timeline hồ sơ liên hệ: gộp quét thẻ, ghi chú, follow-up, hành động khác
 * thành một dòng thời gian dọc (mới nhất trên cùng). Dữ liệu từ
 * GET /api/contacts/[id]/timeline.
 */
export function ContactTimeline({ contactId }: { contactId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}/timeline`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message ?? 'Không tải được timeline.');
        return;
      }
      setEntries(json.timeline ?? []);
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" /> Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (entries ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chưa có hoạt động nào cho liên hệ này.
          </p>
        ) : (
          <ol className="relative ml-3 space-y-6 border-l pl-6">
            {(entries ?? []).map((entry, index) => {
              const Icon = KIND_ICONS[entry.kind] ?? History;
              const isPrimary = entry.kind === 'card_scan';
              return (
                <li key={entry.kind + entry.at + index} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[37px] flex size-7 items-center justify-center rounded-full ring-4 ring-background',
                      isPrimary ? 'bg-primary/15' : 'bg-muted',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-3.5',
                        isPrimary ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                  </span>
                  <p className="text-sm font-medium leading-snug">{entry.title}</p>
                  {entry.detail && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {entry.detail}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(entry.at)}
                    {entry.meta?.due_at
                      ? ' · Hẹn: ' + formatDate(String(entry.meta.due_at))
                      : ''}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
