'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, DollarSign, Layers, Loader2, RefreshCw } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Skeleton } from '@kit/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@kit/ui/tabs';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu — khớp hợp đồng GET /api/admin/usage?days=7|30|90|all
// ---------------------------------------------------------------------------

interface UsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number | null;
}

interface UsageByModelRow {
  provider: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number | null;
  pricedCalls: number;
}

interface UsageResponse {
  summary: UsageSummary;
  byModel: UsageByModelRow[];
}

type PeriodValue = '7' | '30' | '90' | 'all';

const PERIODS: { value: PeriodValue; label: string }[] = [
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
  { value: '90', label: '90 ngày' },
  { value: 'all', label: 'Tất cả' },
];

// ---------------------------------------------------------------------------
// Chuẩn hóa dữ liệu từ API — tránh NaN/lỗi render khi backend trả lệch schema
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toText(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

function normalizeRow(raw: Record<string, unknown>): UsageByModelRow {
  return {
    provider: toText(raw.provider),
    model: toText(raw.model),
    calls: toNumber(raw.calls),
    inputTokens: toNumber(raw.inputTokens),
    outputTokens: toNumber(raw.outputTokens),
    cachedTokens: toNumber(raw.cachedTokens),
    totalTokens: toNumber(raw.totalTokens),
    costUsd: toNullableNumber(raw.costUsd),
    pricedCalls: toNumber(raw.pricedCalls),
  };
}

function normalizeUsage(json: Record<string, unknown> | null): UsageResponse {
  const rawSummary =
    typeof json?.summary === 'object' && json.summary !== null
      ? (json.summary as Record<string, unknown>)
      : {};
  const summary: UsageSummary = {
    calls: toNumber(rawSummary.calls),
    inputTokens: toNumber(rawSummary.inputTokens),
    outputTokens: toNumber(rawSummary.outputTokens),
    cachedTokens: toNumber(rawSummary.cachedTokens),
    totalTokens: toNumber(rawSummary.totalTokens),
    costUsd: toNullableNumber(rawSummary.costUsd),
  };

  const byModel = Array.isArray(json?.byModel)
    ? json.byModel
        .filter(
          (item): item is Record<string, unknown> =>
            typeof item === 'object' && item !== null,
        )
        .map(normalizeRow)
    : [];

  return { summary, byModel };
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** Số lượng token — dạng nguyên, phân tách hàng nghìn kiểu Việt Nam. */
function formatTokens(value: number): string {
  return value.toLocaleString('vi-VN');
}

/** Chi phí USD — 4 số lẻ, phân tách kiểu Việt Nam. */
function formatCost(value: number): string {
  return value.toLocaleString('vi-VN', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

// ---------------------------------------------------------------------------

function SummaryCard(props: {
  Icon: typeof Coins;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl bg-muted px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <props.Icon size={13} />
        {props.label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{props.value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{props.note}</p>
    </div>
  );
}

/**
 * Dashboard thống kê token (client): tổng hợp theo khoảng thời gian và
 * chi tiết theo model. Dữ liệu từ GET /api/admin/usage?days=...
 */
export function UsageDashboard() {
  const [period, setPeriod] = useState<PeriodValue>('30');
  const [data, setData] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (value: PeriodValue) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: value });
      const res = await fetch(`/api/admin/usage?${params}`);
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!res.ok) {
        setError(
          typeof json?.message === 'string' && json.message.length > 0
            ? json.message
            : 'Không tải được thống kê token.',
        );
        return;
      }
      setData(normalizeUsage(json));
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  /** Sắp xếp theo chi phí giảm dần; chưa có giá thì so theo tổng token. */
  const sortedRows = useMemo(() => {
    if (!data) return [];
    return [...data.byModel].sort((a, b) => {
      const costDiff = (b.costUsd ?? 0) - (a.costUsd ?? 0);
      if (costDiff !== 0) return costDiff;
      return b.totalTokens - a.totalTokens;
    });
  }, [data]);

  const summary = data?.summary ?? null;
  const hasData = sortedRows.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Token theo khoảng thời gian</CardTitle>
            <CardDescription className="mt-1">
              Tổng hợp lượt gọi AI, token đầu vào (có tách phần cache) và chi
              phí quy đổi USD theo model.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={period}
              onValueChange={(value) => setPeriod(value as PeriodValue)}
            >
              <TabsList>
                {PERIODS.map((item) => (
                  <TabsTrigger key={item.value} value={item.value}>
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(period)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Làm mới
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Không tải được thống kê</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void load(period)}
              >
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loading && !summary ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : summary ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              Icon={Layers}
              label="Tổng token"
              value={formatTokens(summary.totalTokens)}
              note={`${formatTokens(summary.calls)} lượt gọi AI`}
            />
            <SummaryCard
              Icon={Coins}
              label="Token đầu vào"
              value={formatTokens(summary.inputTokens)}
              note={`Trong đó cache: ${formatTokens(summary.cachedTokens)}`}
            />
            <SummaryCard
              Icon={Coins}
              label="Token đầu ra"
              value={formatTokens(summary.outputTokens)}
              note="Token sinh ra bởi model"
            />
            <SummaryCard
              Icon={DollarSign}
              label="Chi phí (USD)"
              value={summary.costUsd === null ? '—' : formatCost(summary.costUsd)}
              note={
                summary.costUsd === null
                  ? 'Chưa có giá — thêm bảng giá bên dưới'
                  : 'Quy đổi theo bảng giá hiện tại'
              }
            />
          </div>
        ) : null}

        {loading && !data ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : hasData ? (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Lượt gọi</TableHead>
                  <TableHead className="text-right">Input</TableHead>
                  <TableHead className="text-right">Cached</TableHead>
                  <TableHead className="text-right">Output</TableHead>
                  <TableHead className="text-right">Tổng</TableHead>
                  <TableHead className="text-right">Chi phí USD</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => (
                  <TableRow key={`${row.provider}::${row.model}`}>
                    <TableCell>
                      <p className="font-mono text-sm font-medium">
                        {row.model}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.provider}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(row.calls)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(row.inputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(row.cachedTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(row.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(row.totalTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.costUsd === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatCost(row.costUsd)
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          !error && (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Chưa có lượt gọi AI nào được ghi — chạy Quét danh thiếp/
              Enrichment/Chat để có dữ liệu.
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
