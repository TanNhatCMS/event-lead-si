'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Card, CardContent } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Spinner } from '@kit/ui/spinner';

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  'contact.create': 'Tạo liên hệ',
  'contact.update': 'Sửa liên hệ',
  'contact.delete': 'Xóa liên hệ',
  'company.create': 'Tạo công ty',
  'company.update': 'Sửa công ty',
  'company.delete': 'Xóa công ty',
  'note.create': 'Tạo ghi chú',
  'note.update': 'Sửa ghi chú',
  'note.delete': 'Xóa ghi chú',
  'card_import.confirm': 'Xác nhận danh thiếp',
  'card_import.delete': 'Xóa bản nhập',
  'document.upload': 'Tải tài liệu',
  'document.delete': 'Xóa tài liệu',
  'enrichment.run': 'Chạy enrichment',
  'ai_model.update': 'Đổi cấu hình AI',
  'share.create': 'Tạo link chia sẻ',
};

const ENTITY_LABELS: Record<string, string> = {
  contact: 'Liên hệ',
  company: 'Công ty',
  meeting_note: 'Ghi chú',
  card_import: 'Danh thiếp',
  document: 'Tài liệu',
  enrichment: 'Enrichment',
  ai_model: 'Mô hình AI',
  share: 'Chia sẻ',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Nhật ký hành động: ai (chính bạn) đã làm gì, lúc nào.
 * Phase 1: đọc từ bảng audit_logs. Phase 2 sẽ bổ sung tab xem trace OpenTelemetry.
 */
export function AuditLogList() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [action, setAction] = useState('');
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        action,
        limit: '50',
        offset: '0',
      });
      const res = await fetch(`/api/audit-logs?${params}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message ?? 'Chưa tải được nhật ký.');
      }
      setLogs(json.logs ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa tải được nhật ký.');
    } finally {
      setLoading(false);
    }
  }, [debounced, action]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trong nhật ký..."
            className="pl-9"
          />
        </div>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Lọc theo hành động"
        >
          <option value="">Mọi hành động</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <History className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Chưa có hành động nào được ghi nhận.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{total} dòng</p>
          <div className="space-y-2">
            {logs.map((row) => (
              <Card key={row.id}>
                <CardContent className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{row.summary || row.action}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="secondary">
                        {ACTION_LABELS[row.action] ?? row.action}
                      </Badge>
                      <Badge variant="outline">
                        {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
                      </Badge>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
