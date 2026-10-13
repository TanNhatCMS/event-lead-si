'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Spinner } from '@kit/ui/spinner';

type Reminder = {
  id: string;
  body: string;
  due_at: string;
  overdue: boolean;
  contact: { id: string; full_name: string; job_title: string | null } | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Widget "Cần chăm sóc": các việc cần làm có hạn, quá hạn lên trước.
 * Đánh dấu xong ngay tại đây.
 */
export function RemindersWidget() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders');
      const json = await res.json();
      if (res.ok) {
        setReminders(json.reminders ?? []);
        setOverdueCount(json.overdue_count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markDone(id: string) {
    try {
      await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true }),
      });
      await load();
    } catch {
      // im lặng: widget phụ, không chặn trải nghiệm
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  if (reminders.length === 0) return null;

  return (
    <Card className={overdueCount > 0 ? 'border-destructive/40' : ''}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" /> Cần chăm sóc
          {overdueCount > 0 && (
            <Badge variant="destructive">{overdueCount} quá hạn</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {reminders.slice(0, 6).map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.body}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {r.contact ? (
                    <Link
                      href={`/home/danh-ba/${r.contact.id}`}
                      className="hover:underline"
                    >
                      {r.contact.full_name}
                      {r.contact.job_title ? ` · ${r.contact.job_title}` : ''}
                    </Link>
                  ) : (
                    '—'
                  )}
                  {' · '}hạn {formatDate(r.due_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.overdue && <Badge variant="destructive">Quá hạn</Badge>}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Đánh dấu đã xong"
                  onClick={() => markDone(r.id)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
