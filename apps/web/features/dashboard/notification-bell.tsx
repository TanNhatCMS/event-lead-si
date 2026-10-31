'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CircleDollarSign,
  ClipboardList,
  Mail,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@kit/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@kit/ui/popover';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

type NotificationItem = {
  kind: 'followup_draft' | 'note_due' | 'budget_exceeded';
  title: string;
  detail: string;
  link: string;
  at: string;
};

const KIND_ICONS: Record<NotificationItem['kind'], typeof Bell> = {
  followup_draft: Mail,
  note_due: ClipboardList,
  budget_exceeded: CircleDollarSign,
};

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Chuông thông báo (notification center): nút Bell + badge số lượng, popover
 * danh sách thông báo tính toán từ /api/notifications (nháp follow-up cũ,
 * việc đến hạn, budget vượt) với link điều hướng và nút tải lại.
 */
export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? 'Không tải được thông báo.');
      }
      setItems(Array.isArray(json.notifications) ? json.notifications : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được thông báo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = items.length;

  return (
    <Popover>
      <PopoverTrigger
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground"
        aria-label={'Thông báo (' + count + ')'}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
            {count > 20 ? '20+' : count}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Thông báo</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Tải lại thông báo"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : error ? (
            <p className="px-3 py-6 text-center text-sm text-destructive">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Không có thông báo nào.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item, index) => {
                const Icon = KIND_ICONS[item.kind] ?? Bell;
                return (
                  <li key={item.kind + '-' + index}>
                    <Link
                      href={item.link}
                      className="flex items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-accent/50"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{item.title}</p>
                        {item.detail && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {item.detail}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatAt(item.at)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
