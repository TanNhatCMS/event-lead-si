'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Phone, Mail, Search, Users, X } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button, buttonVariants } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Checkbox } from '@kit/ui/checkbox';
import { Input } from '@kit/ui/input';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

type ContactRow = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  relationship_stage: string | null;
  archived_at: string | null;
  updated_at: string;
  companies: { id: string; display_name: string } | null;
};

const STAGE_LABELS: Record<string, string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  meeting: 'Đã gặp',
  negotiating: 'Đang đàm phán',
  customer: 'Khách hàng',
  lost: 'Không tiếp tục',
};

type ExportFormat = 'csv' | 'excel' | 'vcard';

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Danh sách liên hệ: tìm kiếm theo tên/email/SĐT/chức danh,
 * chuyển tab Đang hoạt động / Đã lưu trữ, chọn nhiều để xuất file
 * (CSV / Excel / vCard).
 */
export function ContactsList() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [archived, setArchived] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: debounced,
        archived: String(archived),
        limit: '100',
      });
      const res = await fetch(`/api/contacts?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Tải danh sách thất bại.');
      setContacts(json.contacts);
      setTotal(json.total);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tải danh sách thất bại.');
    } finally {
      setLoading(false);
    }
  }, [debounced, archived]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExport(format: ExportFormat) {
    setExporting(format);
    setExportError(null);
    try {
      const res = await fetch('/api/contacts/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          ids: selected.size > 0 ? Array.from(selected) : [],
          q: debounced,
          archived,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? 'Xuất file thất bại.');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ?? `danh-ba.${format === 'vcard' ? 'vcf' : format === 'excel' ? 'xlsx' : 'csv'}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Xuất file thất bại.');
    } finally {
      setExporting(null);
    }
  }

  const selectedCount = selected.size;
  const exportLabel = selectedCount > 0 ? `Xuất ${selectedCount} đã chọn` : 'Xuất tất cả';

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên, email, SĐT, chức danh..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={archived ? 'outline' : 'default'}
            size="sm"
            onClick={() => setArchived(false)}
          >
            <Users className="mr-1.5 h-4 w-4" />
            Đang hoạt động
          </Button>
          <Button
            variant={archived ? 'default' : 'outline'}
            size="sm"
            onClick={() => setArchived(true)}
          >
            <Archive className="mr-1.5 h-4 w-4" />
            Đã lưu trữ
          </Button>
        </div>
      </div>

      {exportError && (
        <p className="text-sm text-destructive">{exportError}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : contacts.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <p className="text-sm font-medium">Chưa có liên hệ nào</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {debounced
                ? 'Thử từ khóa khác, hoặc quét danh thiếp mới.'
                : 'Quét danh thiếp để thêm liên hệ đầu tiên của bạn.'}
            </p>
            <Link
              href="/home/quet-danh-thiep"
              className={cn(buttonVariants({ variant: 'outline' }), 'mt-4')}
            >
              Quét danh thiếp
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {total} liên hệ{debounced ? ` khớp "${debounced}"` : ''}
              {selectedCount > 0 && ` · đã chọn ${selectedCount}`}
            </p>
            <div className="flex items-center gap-2">
              {selectedCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set())}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Bỏ chọn
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={exporting !== null}
                onClick={() => handleExport('csv')}
                title={exportLabel}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {exporting === 'csv' ? 'Đang xuất...' : 'CSV'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exporting !== null}
                onClick={() => handleExport('excel')}
                title={exportLabel}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {exporting === 'excel' ? 'Đang xuất...' : 'Excel'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={exporting !== null}
                onClick={() => handleExport('vcard')}
                title={exportLabel}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {exporting === 'vcard' ? 'Đang xuất...' : 'vCard'}
              </Button>
            </div>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {contacts.map((c) => (
              <li key={c.id} className="relative">
                <div
                  className="absolute left-3 top-3 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selected.has(c.id)}
                    onCheckedChange={() => toggleSelect(c.id)}
                    aria-label={`Chọn ${c.full_name}`}
                    className="bg-background"
                  />
                </div>
                <Link href={`/home/danh-ba/${c.id}`}>
                  <Card
                    className={cn(
                      'transition-colors hover:border-primary/40',
                      selected.has(c.id) && 'border-primary/60 ring-1 ring-primary/30',
                    )}
                  >
                    <CardContent className="flex items-start gap-4 p-4 pl-11">
                      <div
                        className={cn(
                          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                          c.archived_at
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-primary/10 text-primary',
                        )}
                      >
                        {initials(c.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{c.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[c.job_title, c.companies?.display_name]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {c.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span className="max-w-40 truncate">{c.email}</span>
                            </span>
                          )}
                          {c.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {c.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {c.relationship_stage && (
                          <Badge variant="secondary">
                            {STAGE_LABELS[c.relationship_stage] ?? c.relationship_stage}
                          </Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(c.updated_at)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
