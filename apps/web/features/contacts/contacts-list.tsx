'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  Copy,
  Download,
  FileUp,
  Mail,
  MoreVertical,
  Phone,
  Search,
  Share2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button, buttonVariants } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Checkbox } from '@kit/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@kit/ui/dropdown-menu';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Spinner } from '@kit/ui/spinner';
import { toast } from '@kit/ui/sonner';
import { Textarea } from '@kit/ui/textarea';
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
  // Backend có thể trả về qua join event_contacts: một chuỗi hoặc mảng id.
  event_id?: string | string[] | null;
};

type EventItem = { id: string; name: string };

type ImportResult = {
  created: number;
  skipped: number;
  duplicates: Array<{ name: string; reason: string }>;
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

/** So khớp liên hệ với sự kiện (event_id có thể là chuỗi hoặc mảng từ join). */
function matchEvent(
  value: string | string[] | null | undefined,
  eventId: string,
): boolean {
  if (Array.isArray(value)) return value.includes(eventId);
  return value === eventId;
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

  // Lọc theo sự kiện (GET /api/events; gửi kèm event_id khi tải liên hệ).
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventId, setEventId] = useState<string>('');

  // Import CSV (POST /api/contacts/import).
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Chia sẻ liên hệ (POST /api/contacts/[id]/share).
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [shared, setShared] = useState<{ name: string; url: string } | null>(null);
  const [sharedCopied, setSharedCopied] = useState(false);

  // Làm giàu dữ liệu hàng loạt (POST /api/enrichment/batch).
  const [enriching, setEnriching] = useState(false);

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
      // Backend có thể bỏ qua param này — client tự lọc thêm ở dưới nếu có event_id.
      if (eventId) params.set('event_id', eventId);
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
  }, [debounced, archived, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tải danh sách sự kiện để lọc — thất bại thì ẩn bộ lọc (graceful).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/events');
        if (!res.ok) return;
        const json = await res.json();
        setEvents(Array.isArray(json) ? json : (json.events ?? []));
      } catch {
        // im lặng: bộ lọc sự kiện là tùy chọn
      }
    })();
  }, []);

  // Lọc client-side khi backend chưa hỗ trợ event_id trên list contacts.
  const visibleContacts = useMemo(() => {
    if (!eventId) return contacts;
    if (!contacts.some((c) => c.event_id !== undefined)) return contacts;
    return contacts.filter((c) => matchEvent(c.event_id, eventId));
  }, [contacts, eventId]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Tạo link chia sẻ công khai cho một liên hệ. */
  async function handleShare(contact: ContactRow) {
    setSharingId(contact.id);
    try {
      const res = await fetch(`/api/contacts/${contact.id}/share`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.shareUrl) {
        throw new Error(json.message ?? 'Tạo link chia sẻ thất bại.');
      }
      setShared({ name: contact.full_name, url: json.shareUrl });
      setSharedCopied(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Tạo link chia sẻ thất bại.');
    } finally {
      setSharingId(null);
    }
  }

  async function copySharedUrl() {
    if (!shared) return;
    try {
      await navigator.clipboard.writeText(shared.url);
      setSharedCopied(true);
    } catch {
      toast.error('Không sao chép được — vui lòng copy thủ công từ ô bên dưới.');
    }
  }

  /** Import CSV: đọc file hoặc dán nội dung rồi gửi chuỗi csv nguyên vẹn. */
  async function handleImport() {
    if (!csvText.trim()) {
      setImportError('Vui lòng chọn file CSV hoặc dán nội dung vào ô bên dưới.');
      return;
    }
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? 'Import CSV thất bại.');
      }
      setImportResult({
        created: json.created ?? 0,
        skipped: json.skipped ?? 0,
        duplicates: json.duplicates ?? [],
      });
      await load();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import CSV thất bại.');
    } finally {
      setImporting(false);
    }
  }

  async function handleCsvFile(file: File | undefined | null) {
    if (!file) return;
    try {
      const text = await file.text();
      setCsvText(text);
      setImportError(null);
    } catch {
      setImportError('Không đọc được file CSV.');
    }
  }

  /** Làm giàu dữ liệu (AI) cho các liên hệ đang chọn — chạy nền trên server. */
  async function handleBatchEnrichment() {
    if (selected.size === 0) return;
    if (selected.size > 20) {
      toast.error('Tối đa 20 liên hệ mỗi lần làm giàu dữ liệu. Vui lòng chọn ít hơn.');
      return;
    }
    setEnriching(true);
    try {
      const res = await fetch('/api/enrichment/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selected) }),
      });
      if (res.status === 404 || res.status === 503) {
        toast.error('Batch enrichment chưa sẵn sàng. Vui lòng thử lại sau.');
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? 'Không bắt đầu được làm giàu dữ liệu.');
      }
      toast.success(
        `Đã bắt đầu làm giàu dữ liệu cho ${json.started ?? selected.size} liên hệ — chạy nền, kết quả sẽ tự cập nhật vào hồ sơ.`,
      );
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không bắt đầu được làm giàu dữ liệu.');
    } finally {
      setEnriching(false);
    }
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
        <div className="flex flex-wrap gap-2">
          {events.length > 0 && (
            <Select
              value={eventId || 'all'}
              onValueChange={(value) => setEventId(!value || value === 'all' ? '' : value)}
            >
              <SelectTrigger className="h-9 w-full sm:w-52">
                <SelectValue placeholder="Tất cả sự kiện">
                  {eventId
                    ? (events.find((e) => e.id === eventId)?.name ?? 'Sự kiện')
                    : 'Tất cả sự kiện'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả sự kiện</SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
              href="/dashboard/quet-danh-thiep"
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
                disabled={enriching}
                onClick={() => void handleBatchEnrichment()}
                title="Dùng AI bổ sung thông tin cho các liên hệ đã chọn"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {enriching ? 'Đang bắt đầu...' : `Làm giàu dữ liệu (${selectedCount})`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setImportOpen(true);
                  setImportResult(null);
                  setImportError(null);
                }}
              >
                <FileUp className="mr-1.5 h-3.5 w-3.5" />
                Import CSV
              </Button>
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
            {visibleContacts.length === 0 ? (
              <li className="md:col-span-2">
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Không có liên hệ nào thuộc sự kiện này.
                </p>
              </li>
            ) : (
              visibleContacts.map((c) => (
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
                <Link href={`/dashboard/danh-ba/${c.id}`}>
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
                      <div className="flex shrink-0 flex-col items-end gap-1.5 pr-8">
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
                {/* Hành động liên hệ: nằm ngoài Link để bấm không điều hướng */}
                <div className="absolute right-2 top-2 z-10">
                  <DropdownMenu>
                    {/* Base UI Trigger tự render button — style trực tiếp, không dùng asChild */}
                    <DropdownMenuTrigger
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground outline-none transition hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                      aria-label={`Hành động cho ${c.full_name}`}
                      disabled={sharingId === c.id}
                    >
                      {sharingId === c.id ? (
                        <Spinner className="h-3.5 w-3.5" />
                      ) : (
                        <MoreVertical className="h-4 w-4" />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void handleShare(c)}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Tạo link chia sẻ
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
              )))}
          </ul>
        </>
      )}
      {/* Dialog tạo link chia sẻ liên hệ */}
      <Dialog open={shared !== null} onOpenChange={(open) => !open && setShared(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chia sẻ liên hệ</DialogTitle>
            <DialogDescription>
              Bất kỳ ai có link này đều xem được thông tin công khai của{' '}
              {shared?.name ?? 'liên hệ'}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={shared?.url ?? ''} onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => void copySharedUrl()}>
              {sharedCopied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {sharedCopied ? 'Đã sao chép' : 'Copy'}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShared(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog import CSV */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          if (!open) {
            setImportOpen(false);
            setCsvText('');
            setImportResult(null);
            setImportError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import CSV</DialogTitle>
            <DialogDescription>
              Tải file CSV hoặc dán nội dung (các cột: họ tên, email, SĐT, công ty…).
              Hệ thống tự bỏ qua dòng trùng.
            </DialogDescription>
          </DialogHeader>
          {importResult ? (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold text-emerald-600">
                  {importResult.created} liên hệ đã tạo
                </span>
                {' · '}
                <span className="text-muted-foreground">
                  {importResult.skipped} bỏ qua
                </span>
              </p>
              {importResult.duplicates.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Bản ghi trùng:
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                    {importResult.duplicates.map((d, i) => (
                      <li key={`${d.name}-${i}`}>
                        <span className="font-medium text-foreground">{d.name}</span>
                        {d.reason ? ` — ${d.reason}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="csv-file">Chọn file CSV</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void handleCsvFile(e.target.files?.[0])}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="csv-text">Hoặc dán nội dung CSV</Label>
                <Textarea
                  id="csv-text"
                  rows={6}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={'full_name,email,phone,company_name\nNguyen Van A,a@ex.com,090...,Cong ty ABC'}
                  className="font-mono text-xs"
                />
              </div>
              {importError && <p className="text-sm text-destructive">{importError}</p>}
            </div>
          )}
          <DialogFooter>
            {importResult ? (
              <Button onClick={() => setImportOpen(false)}>Xong</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setImportOpen(false)}>
                  Hủy
                </Button>
                <Button disabled={importing} onClick={() => void handleImport()}>
                  {importing ? 'Đang import...' : 'Import'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
