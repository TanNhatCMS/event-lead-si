'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';

type FollowUpItem = {
  id: string;
  contact_id?: string | null;
  subject?: string | null;
  body?: string | null;
  status?: string | null;
  created_at?: string | null;
  sent_at?: string | null;
  // Hợp đồng GET /api/followups: contact_name phẳng (join từ contacts).
  contact_name?: string | null;
  // aging_contacts trả thẳng full_name (id chính là mã liên hệ).
  full_name?: string | null;
  // Dự phòng nếu backend trả object lồng nhau.
  contact?: { id?: string; full_name?: string } | null;
  contacts?: { id?: string; full_name?: string } | null;
};

type TabId = 'draft' | 'pending' | 'sent';

function contactName(item: FollowUpItem) {
  return (
    item.contact_name ??
    item.full_name ??
    item.contact?.full_name ??
    item.contacts?.full_name ??
    'Liên hệ'
  );
}

function contactHref(item: FollowUpItem) {
  // aging_contacts: id chính là mã liên hệ; follow_ups: dùng contact_id.
  const id = item.contact?.id ?? item.contact_id ?? (item.full_name ? item.id : undefined);
  return id ? `/dashboard/danh-ba/${id}` : null;
}

/** Với aging_contacts, `id` chính là mã liên hệ. */
function contactIdOf(item: FollowUpItem) {
  return item.contact_id ?? item.contact?.id ?? item.id;
}

/**
 * Hàng đợi follow-up: gợi ý liên hệ cần soạn tin (aging 7 ngày), duyệt/từ chối
 * bản nháp AI, xem lịch sử đã gửi.
 * API: GET /api/followups?status=&aging_days=, POST /api/followups,
 * PATCH/DELETE (thử /api/followups/[id] trước, fallback body {id}).
 */
export function FollowUpQueue() {
  const [tab, setTab] = useState<TabId>('pending');
  const [suggestions, setSuggestions] = useState<FollowUpItem[]>([]);
  const [drafts, setDrafts] = useState<FollowUpItem[]>([]);
  const [sent, setSent] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchList = useCallback(
    async (params: string): Promise<FollowUpItem[]> => {
      const res = await fetch(`/api/followups${params}`);
      if (res.status === 404 || res.status === 503) {
        throw new Error('Chưa có API follow-up — vui lòng thử lại sau.');
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? 'Tải hàng đợi follow-up thất bại.');
      }
      const json = await res.json();
      // aging_days → aging_contacts; chế độ thường → follow_ups.
      return json.aging_contacts ?? json.follow_ups ?? json.followups ?? [];
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const [s, d, se] = await Promise.all([
        fetchList('?aging_days=7'),
        fetchList('?status=draft'),
        fetchList('?status=sent'),
      ]);
      setSuggestions(s);
      setDrafts(d);
      setSent(se);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tải hàng đợi follow-up thất bại.');
    } finally {
      setLoading(false);
    }
  }, [fetchList]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // Hợp đồng: PATCH/DELETE /api/followups với { id, ...status/subject/body } trong body.
  async function mutateFollowup(
    id: string,
    method: 'PATCH' | 'DELETE',
    patch?: Record<string, unknown>,
  ): Promise<boolean> {
    const res = await fetch('/api/followups', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...(patch ?? {}) }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.message ?? 'Thao tác thất bại, vui lòng thử lại.');
      return false;
    }
    return true;
  }

  async function createDraft(contactId: string, itemId: string) {
    setBusyId(itemId);
    setError(null);
    try {
      const res = await fetch('/api/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message ?? 'Soạn nháp thất bại.');
      }
      await load();
      setTab('pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Soạn nháp thất bại.');
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(item: FollowUpItem, status: 'approved' | 'dismissed') {
    setBusyId(item.id);
    setError(null);
    const ok = await mutateFollowup(item.id, 'PATCH', { status });
    if (ok) await load();
    setBusyId(null);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderItem(
    item: FollowUpItem,
    mode: 'suggest' | 'pending' | 'sent',
  ) {
    const href = contactHref(item);
    const isOpen = expanded.has(item.id);
    const busy = busyId === item.id;

    return (
      <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {href ? (
              <Link href={href} className="truncate text-sm font-medium hover:underline">
                {contactName(item)}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium">{contactName(item)}</span>
            )}
            {mode === 'sent' && (
              <Badge variant="secondary" className="shrink-0">
                <Clock className="mr-1 h-3 w-3" />
                {(item.sent_at ?? item.created_at)
                  ? new Date((item.sent_at ?? item.created_at)!).toLocaleDateString('vi-VN')
                  : '—'}
              </Badge>
            )}
          </div>
          {item.subject && (
            <p className="mt-0.5 truncate text-xs font-medium text-foreground/80">
              {item.subject}
            </p>
          )}
          {item.body ? (
            <>
              <button
                type="button"
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => toggleExpanded(item.id)}
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {isOpen ? 'Ẩn nội dung' : 'Xem nội dung'}
              </button>
              {isOpen && (
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                  {item.body}
                </p>
              )}
            </>
          ) : (
            mode === 'suggest' && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Liên hệ chưa được follow-up trong hơn 7 ngày.
              </p>
            )
          )}
        </div>

        {mode === 'suggest' && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={busy}
            onClick={() => void createDraft(contactIdOf(item), item.id)}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {busy ? 'Đang soạn...' : 'AI soạn'}
          </Button>
        )}
        {mode === 'pending' && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void setStatus(item, 'approved')}
            >
              <Check className="mr-1 h-3.5 w-3.5" /> Duyệt
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void setStatus(item, 'dismissed')}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Từ chối
            </Button>
          </div>
        )}
      </li>
    );
  }

  const pendingCount = drafts.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-4 w-4" /> Follow-up
          </CardTitle>
          <CardDescription>
            Gợi ý liên hệ cần chăm sóc, duyệt bản nháp AI trước khi gửi.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Tải lại"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">Đang tải...</span>
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(value) => value && setTab(value as TabId)}
          >
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="pending">
                Chờ duyệt
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="draft">Cần soạn</TabsTrigger>
              <TabsTrigger value="sent">Đã gửi</TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              {drafts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Không có bản nháp nào chờ duyệt.
                </p>
              ) : (
                <ul className="divide-y divide-border">{drafts.map((d) => renderItem(d, 'pending'))}</ul>
              )}
            </TabsContent>

            <TabsContent value="draft">
              {suggestions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Không có liên hệ nào quá 7 ngày chưa được follow-up.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {suggestions.map((s) => renderItem(s, 'suggest'))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="sent">
              {sent.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Chưa có follow-up nào được gửi.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {sent.slice(0, 20).map((s) => renderItem(s, 'sent'))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
