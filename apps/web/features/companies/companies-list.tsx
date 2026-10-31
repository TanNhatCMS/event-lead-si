'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Building2, Check, Copy, ExternalLink, Users } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button, buttonVariants } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

type CompanyRow = {
  id: string;
  display_name: string;
  website: string | null;
  industry: string | null;
  profile_state: string | null;
  share_token: string;
  updated_at: string;
  contacts_count: number;
};

const PROFILE_LABELS: Record<string, string> = {
  user_provided: 'Người dùng cung cấp',
  partially_verified: 'Xác minh một phần',
  verified: 'Đã xác minh',
  needs_review: 'Cần xem lại',
};

/**
 * Danh sách công ty: số liên hệ, link chia sẻ công khai (sao chép).
 */
export function CompaniesList() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/companies');
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? 'Tải danh sách thất bại.');
        setCompanies(json.companies);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Tải danh sách thất bại.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function copyShareLink(token: string) {
    const url = `${window.location.origin}/chia-se/${token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(token);
    setTimeout(() => setCopied((t) => (t === token ? null : t)), 2000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (companies.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center">
          <p className="text-sm font-medium">Chưa có công ty nào</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Công ty được tạo tự động khi anh xác nhận danh thiếp.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {companies.map((c) => (
        <li key={c.id}>
          <Card>
            <CardContent className="flex items-start gap-4 p-4">
              <Link
                href={`/dashboard/cong-ty/${c.id}`}
                className="group flex min-w-0 flex-1 items-start gap-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold group-hover:underline">
                    {c.display_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.industry, c.website].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      <Users className="mr-1 h-3 w-3" />
                      {c.contacts_count} liên hệ
                    </Badge>
                    {c.profile_state && (
                      <Badge variant="outline">
                        {PROFILE_LABELS[c.profile_state] ?? c.profile_state}
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
              <div className="flex shrink-0 flex-col gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyShareLink(c.share_token)}
                >
                  {copied === c.share_token ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Đã chép
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Link chia sẻ
                    </>
                  )}
                </Button>
                <a
                  href={`/chia-se/${c.share_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Xem trang
                </a>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
