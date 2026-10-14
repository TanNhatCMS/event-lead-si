'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ChevronLeft, XCircle } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent } from '@kit/ui/card';
import { Spinner } from '@kit/ui/spinner';
import { cn } from '@kit/ui/utils';

type TraceSummary = {
  trace_id: string;
  root_name: string;
  span_count: number;
  started_at: string;
  duration_ms: number;
  has_error: boolean;
};

type Span = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  status_code: string;
  status_message: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; time: string; attributes: Record<string, unknown> }>;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Tên hiển thị gọn cho span của AI SDK. */
function shortName(name: string) {
  return name
    .replace(/^ai\.generateText\.doGenerate$/, 'LLM generate')
    .replace(/^ai\.generateText$/, 'generateText')
    .replace(/^ai\.model\./, 'model.');
}

function TraceWaterfall({ spans }: { spans: Span[] }) {
  const [selected, setSelected] = useState<Span | null>(null);

  const layout = useMemo(() => {
    if (spans.length === 0) return { rows: [], start: 0, total: 1 };
    const start = Math.min(...spans.map((s) => new Date(s.started_at).getTime()));
    const end = Math.max(...spans.map((s) => new Date(s.ended_at).getTime()));
    const total = Math.max(end - start, 1);
    const byId = new Map(spans.map((s) => [s.span_id, s]));
    const depthOf = (s: Span, seen = new Set<string>()): number => {
      if (!s.parent_span_id || seen.has(s.span_id)) return 0;
      seen.add(s.span_id);
      const parent = byId.get(s.parent_span_id);
      return parent ? 1 + depthOf(parent, seen) : 0;
    };
    const rows = spans.map((s) => {
      const sStart = new Date(s.started_at).getTime() - start;
      const sEnd = new Date(s.ended_at).getTime() - start;
      return {
        span: s,
        depth: depthOf(s),
        left: (sStart / total) * 100,
        width: Math.max(((sEnd - sStart) / total) * 100, 0.5),
      };
    });
    return { rows, start, total };
  }, [spans]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {layout.rows.map(({ span, depth, left, width }) => (
          <button
            key={span.span_id}
            onClick={() => setSelected(span)}
            className="block w-full text-left"
          >
            <div className="flex items-center gap-2">
              <div
                className="shrink-0 truncate text-xs text-muted-foreground"
                style={{ width: 180, paddingLeft: depth * 16 }}
              >
                {shortName(span.name)}
              </div>
              <div className="relative h-5 flex-1 rounded bg-muted/50">
                <div
                  className={cn(
                    'absolute top-1 h-3 rounded',
                    span.status_code === 'ERROR' ? 'bg-destructive' : 'bg-primary/70',
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${shortName(span.name)} — ${formatDuration(span.duration_ms)}`}
                />
              </div>
              <div className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatDuration(span.duration_ms)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <Card>
          <CardContent className="space-y-2 py-4 text-sm">
            <p className="font-medium">{shortName(selected.name)}</p>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>Kind: {selected.kind}</span>
              <span>Trạng thái: {selected.status_code}</span>
              <span>Bắt đầu: {formatDateTime(selected.started_at)}</span>
              <span>Kéo dài: {formatDuration(selected.duration_ms)}</span>
            </div>
            {selected.status_message && (
              <p className="text-xs text-destructive">{selected.status_message}</p>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Attributes</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2">
                {JSON.stringify(selected.attributes, null, 2)}
              </pre>
            </details>
            {selected.events.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Events ({selected.events.length})
                </summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2">
                  {JSON.stringify(selected.events, null, 2)}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Tab Trace: danh sách trace OpenTelemetry gần nhất, bấm vào xem waterfall.
 */
export function TraceList() {
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTraceId, setOpenTraceId] = useState<string | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [spansLoading, setSpansLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/traces?limit=20');
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Chưa tải được danh sách trace.');
      setTraces(json.traces ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa tải được danh sách trace.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTrace = async (traceId: string) => {
    setOpenTraceId(traceId);
    setSpansLoading(true);
    try {
      const res = await fetch(`/api/traces/${traceId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Chưa tải được trace.');
      setSpans(json.spans ?? []);
    } catch {
      setSpans([]);
    } finally {
      setSpansLoading(false);
    }
  };

  if (openTraceId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setOpenTraceId(null)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Danh sách trace
        </Button>
        {spansLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <TraceWaterfall spans={spans} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Trace các bước AI: nhận dạng danh thiếp, enrichment, gợi ý sourcing, soạn follow-up...
        Span được ghi khi bật AI Gateway (cần SUPABASE_SERVICE_ROLE_KEY để lưu).
      </p>
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : traces.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Activity className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Chưa có trace nào. Hãy chạy một tính năng AI (quét danh thiếp, enrichment...)
              rồi quay lại.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {traces.map((t) => (
            <button key={t.trace_id} onClick={() => void openTrace(t.trace_id)} className="block w-full text-left">
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{t.root_name}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary">{t.span_count} span</Badge>
                      {t.has_error && (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" /> Lỗi
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(t.started_at)}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDuration(t.duration_ms)}
                  </span>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
