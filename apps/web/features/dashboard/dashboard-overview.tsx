'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ScanLine,
  Sparkles,
  Users,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

import { EventSelector } from './event-selector';
import { FollowUpQueue } from './follow-up-queue';
import { RemindersWidget } from './reminders-widget';
import { DataPolicyCard } from './data-policy-card';

type Stats = {
  contacts_active: number;
  contacts_archived: number;
  contacts_new_7d: number;
  contacts_new_30d: number;
  companies: number;
  scans_total: number;
  scans_pending: number;
  by_stage: Record<string, number>;
};

type RecentContact = {
  id: string;
  full_name: string;
  job_title: string | null;
  created_at: string;
  companies: { display_name: string } | null;
};

const STAGES = [
  { id: 'new', label: 'Mới' },
  { id: 'contacted', label: 'Đã liên hệ' },
  { id: 'meeting', label: 'Đã gặp' },
  { id: 'negotiating', label: 'Đang đàm phán' },
  { id: 'customer', label: 'Khách hàng' },
  { id: 'lost', label: 'Không tiếp tục' },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Trang tổng quan EventLead: số liệu thật thay cho demo của kit.
 */
export function DashboardOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dashboard/stats');
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? 'Tải số liệu thất bại.');
        setStats(json.stats);
        setRecent(json.recent ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Tải số liệu thất bại.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-destructive">
          {error ?? 'Tải số liệu thất bại.'}
        </CardContent>
      </Card>
    );
  }

  const maxStage = Math.max(1, ...STAGES.map((s) => stats.by_stage[s.id] ?? 0));

  const statCards = [
    {
      label: 'Liên hệ đang hoạt động',
      value: stats.contacts_active,
      sub: `+${stats.contacts_new_7d} trong 7 ngày`,
      icon: Users,
      href: '/home/danh-ba',
    },
    {
      label: 'Công ty',
      value: stats.companies,
      sub: `${stats.contacts_archived} liên hệ đã lưu trữ`,
      icon: Building2,
      href: '/home/cong-ty',
    },
    {
      label: 'Lượt quét danh thiếp',
      value: stats.scans_total,
      sub:
        stats.scans_pending > 0
          ? `${stats.scans_pending} đang chờ xem lại`
          : 'Không có lượt chờ xử lý',
      icon: ScanLine,
      href: '/home/quet-danh-thiep',
    },
    {
      label: 'Mới trong 30 ngày',
      value: stats.contacts_new_30d,
      sub: 'Liên hệ được thêm gần đây',
      icon: Sparkles,
      href: '/home/danh-ba',
    },
  ];

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Phiên sự kiện: chọn/tạo sự kiện + số liệu theo sự kiện */}
      <EventSelector />

      {/* Nhắc việc cần chăm sóc */}
      <RemindersWidget />

      {/* Hàng đợi follow-up: cần soạn / chờ duyệt / đã gửi */}
      <FollowUpQueue />

      {/* Chính sách dữ liệu: retention liên hệ đã lưu trữ + dọn dẹp thủ công */}
      <DataPolicyCard />

      {/* Thẻ số liệu */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
                  <s.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-3xl font-bold tracking-tight">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Theo giai đoạn */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liên hệ theo giai đoạn</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {STAGES.map((stage) => {
              const count = stats.by_stage[stage.id] ?? 0;
              return (
                <div key={stage.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{stage.label}</span>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        stage.id === 'lost' ? 'bg-muted-foreground/40' : 'bg-primary',
                      )}
                      style={{ width: `${(count / maxStage) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Mới nhất */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Liên hệ mới nhất</CardTitle>
            <Link
              href="/home/danh-ba"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Xem tất cả <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-medium">Chưa có liên hệ nào</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quét danh thiếp đầu tiên để bắt đầu.
                </p>
                <Link
                  href="/home/quet-danh-thiep"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <ScanLine className="h-4 w-4" /> Quét danh thiếp
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/home/danh-ba/${c.id}`}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[c.job_title, c.companies?.display_name]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {formatDate(c.created_at)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
