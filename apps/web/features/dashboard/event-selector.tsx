'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, MapPin, Plus, RefreshCw } from 'lucide-react';

import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
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

type EventItem = {
  id: string;
  name: string;
  location?: string | null;
  starts_at?: string | null;
};

type EventStats = {
  contacts: number;
  cardImports: number;
  followUpsSent: number;
};

const STORAGE_KEY = 'eventlead.selected-event';

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Widget "Phiên sự kiện": chọn/tạo sự kiện đang tham dự và xem số liệu theo
 * sự kiện (liên hệ, lượt quét danh thiếp, follow-up đã gửi).
 * API: GET/POST /api/events, GET /api/events/[id]/stats.
 */
export function EventSelector() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [stats, setStats] = useState<EventStats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', starts_at: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const loadEvents = useCallback(
    async (preferId?: string) => {
      try {
        const res = await fetch('/api/events');
        if (!res.ok) {
          setUnavailable(true);
          return;
        }
        const json = await res.json();
        const list: EventItem[] = Array.isArray(json) ? json : (json.events ?? []);
        setEvents(list);
        setUnavailable(false);
        setFormError(null);

        // Ưu tiên: chọn truyền vào > localStorage > sự kiện đầu tiên.
        let next = preferId ?? '';
        if (!next && typeof window !== 'undefined') {
          next = window.localStorage.getItem(STORAGE_KEY) ?? '';
        }
        if (!list.some((e) => e.id === next)) {
          next = list[0]?.id ?? '';
        }
        setSelectedId(next);
        setStats(null);
        if (typeof window !== 'undefined') {
          if (next) window.localStorage.setItem(STORAGE_KEY, next);
          else window.localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        setUnavailable(true);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void (async () => {
      await loadEvents();
    })();
  }, [loadEvents]);

  // Tải số liệu khi đổi sự kiện — mọi setState đều sau await (tránh cascade render).
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${selectedId}/stats`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        // Hợp đồng: { stats: { contacts, cardImports, followUpsSent } }.
        const s = json.stats ?? json;
        if (!cancelled) {
          setStats({
            contacts: s.contacts ?? 0,
            cardImports: s.cardImports ?? 0,
            followUpsSent: s.followUpsSent ?? 0,
          });
          setStatsError(false);
        }
      } catch {
        if (!cancelled) {
          setStats(null);
          setStatsError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function handleSelect(value: string | null) {
    if (!value) return;
    setSelectedId(value);
    setStats(null);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value);
    }
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      setFormError('Vui lòng nhập tên sự kiện.');
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          location: form.location.trim() || undefined,
          starts_at: form.starts_at || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? 'Tạo sự kiện thất bại.');
      }
      const created: EventItem | undefined = json.event ?? json;
      setCreateOpen(false);
      setForm({ name: '', location: '', starts_at: '' });
      await loadEvents(created?.id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Tạo sự kiện thất bại.');
    } finally {
      setCreating(false);
    }
  }

  const selected = events.find((e) => e.id === selectedId) ?? null;
  const selectedDate = formatDate(selected?.starts_at);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" /> Sự kiện
          </CardTitle>
          <CardDescription>
            Chọn sự kiện đang tham dự để theo dõi số liệu theo từng sự kiện.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Tải lại danh sách sự kiện"
            disabled={loading}
            onClick={() => void loadEvents(selectedId)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Tạo sự kiện
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner />
          </div>
        ) : unavailable ? (
          <p className="py-2 text-sm text-muted-foreground">
            Tính năng sự kiện chưa sẵn sàng — vui lòng thử lại sau khi backend cập nhật.
          </p>
        ) : events.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Chưa có sự kiện nào. Tạo sự kiện đầu tiên để gắn liên hệ và danh thiếp theo
            từng buổi sự kiện.
          </p>
        ) : (
          <>
            <Select value={selectedId || null} onValueChange={handleSelect}>
              <SelectTrigger className="w-full sm:max-w-sm">
                <SelectValue placeholder="Chọn sự kiện">{selected?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selected && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {selected.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {selected.location}
                  </span>
                )}
                {selectedDate && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" /> {selectedDate}
                  </span>
                )}
              </p>
            )}

            {stats ? (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Liên hệ', value: stats.contacts },
                  { label: 'Danh thiếp đã quét', value: stats.cardImports },
                  { label: 'Follow-up đã gửi', value: stats.followUpsSent },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-lg border bg-muted/30 px-3 py-2.5 text-center"
                  >
                    <p className="text-xl font-bold tracking-tight">{s.value}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            ) : statsError ? (
              <p className="text-xs text-muted-foreground">
                Chưa tải được số liệu của sự kiện này.
              </p>
            ) : (
              <div className="flex items-center justify-center py-4">
                <Spinner />
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(open) => !open && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tạo sự kiện</DialogTitle>
            <DialogDescription>
              Thêm sự kiện mới (hội chợ, hội thảo…) để gắn liên hệ quét được theo từng buổi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-name">Tên sự kiện *</Label>
              <Input
                id="event-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="VD: Vietnam Expo 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-location">Địa điểm</Label>
              <Input
                id="event-location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="VD: SECC, Quận 7, TP.HCM"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-starts">Ngày bắt đầu</Label>
              <Input
                id="event-starts"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Hủy
            </Button>
            <Button disabled={creating} onClick={() => void handleCreate()}>
              {creating ? 'Đang tạo...' : 'Tạo sự kiện'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
