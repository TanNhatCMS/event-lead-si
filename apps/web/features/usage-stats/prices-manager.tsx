'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CloudDownload,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Skeleton } from '@kit/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@kit/ui/table';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu — khớp hợp đồng GET/PUT/DELETE /api/admin/prices
// ---------------------------------------------------------------------------

type PriceSource = 'manual' | 'api' | 'scrape';

interface PriceRow {
  provider: string;
  model: string;
  /** USD / 1 triệu token đầu vào. */
  inputPerMillion: number;
  /** USD / 1 triệu token đầu vào từ cache — null khi không có. */
  cachedInputPerMillion: number | null;
  /** USD / 1 triệu token đầu ra. */
  outputPerMillion: number;
  source: PriceSource;
  updatedAt: string;
}

/** Bản nháp chỉnh sửa giá theo hàng — giữ dạng chuỗi của ô number input. */
interface PriceDraft {
  input: string;
  cached: string;
  output: string;
}

interface SyncResult {
  source: 'gateway' | 'litellm';
  upserted: number;
  skipped: number;
}

const SOURCE_BADGES: Record<PriceSource, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  manual: { label: 'Nhập tay', variant: 'secondary' },
  api: { label: 'API', variant: 'default' },
  scrape: { label: 'Cào', variant: 'outline' },
};

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

function toSource(value: unknown): PriceSource {
  return value === 'api' || value === 'scrape' ? value : 'manual';
}

function normalizePriceRow(raw: Record<string, unknown>): PriceRow | null {
  const provider = toText(raw.provider);
  const model = toText(raw.model);
  if (provider.length === 0 || model.length === 0) return null;
  return {
    provider,
    model,
    inputPerMillion: toNumber(raw.inputPerMillion),
    cachedInputPerMillion: toNullableNumber(raw.cachedInputPerMillion),
    outputPerMillion: toNumber(raw.outputPerMillion),
    source: toSource(raw.source),
    updatedAt: toText(raw.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Parse & format helpers
// ---------------------------------------------------------------------------

type ParseResult<T> = { ok: true; value: T } | { ok: false };

/** Số giá bắt buộc (>= 0). Chuỗi rỗng/không hợp lệ → lỗi. */
function parsePrice(raw: string): ParseResult<number> {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (trimmed.length === 0 || !Number.isFinite(value) || value < 0) {
    return { ok: false };
  }
  return { ok: true, value };
}

/** Số giá tùy chọn (>= 0). Bỏ trống → null. */
function parseOptionalPrice(raw: string): ParseResult<number | null> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return { ok: false };
  return { ok: true, value };
}

/** Giá USD/1M token — tối đa 6 số lẻ, phân tách kiểu Việt Nam. */
function formatPrice(value: number): string {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 6 });
}

function formatDateTime(value: string): string {
  if (value.length === 0) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN');
}

const EMPTY_DRAFT: PriceDraft = { input: '', cached: '', output: '' };

function draftFromRow(row: PriceRow): PriceDraft {
  return {
    input: String(row.inputPerMillion),
    cached: row.cachedInputPerMillion === null ? '' : String(row.cachedInputPerMillion),
    output: String(row.outputPerMillion),
  };
}

/** Ghép draft thành payload PUT — trả lỗi qua message tĩnh khi số không hợp lệ. */
function buildPricePayload(
  provider: string,
  model: string,
  draft: PriceDraft,
): { ok: true; body: Record<string, unknown> } | { ok: false; message: string } {
  const trimmedProvider = provider.trim();
  const trimmedModel = model.trim();
  if (trimmedProvider.length === 0 || trimmedModel.length === 0) {
    return { ok: false, message: 'Nhập tên provider và model.' };
  }
  const input = parsePrice(draft.input);
  if (!input.ok) {
    return { ok: false, message: 'Giá đầu vào không hợp lệ (số >= 0).' };
  }
  const cached = parseOptionalPrice(draft.cached);
  if (!cached.ok) {
    return { ok: false, message: 'Giá input cache không hợp lệ (số >= 0 hoặc bỏ trống).' };
  }
  const output = parsePrice(draft.output);
  if (!output.ok) {
    return { ok: false, message: 'Giá đầu ra không hợp lệ (số >= 0).' };
  }
  return {
    ok: true,
    body: {
      provider: trimmedProvider,
      model: trimmedModel,
      inputPerMillion: input.value,
      cachedInputPerMillion: cached.value,
      outputPerMillion: output.value,
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * Quản lý bảng giá model (client): đồng bộ giá từ AI Gateway / LiteLLM,
 * sửa giá inline, thêm giá thủ công và xóa. Dữ liệu từ /api/admin/prices.
 */
export function PricesManager() {
  const [rows, setRows] = useState<PriceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [syncing, setSyncing] = useState<'gateway' | 'litellm' | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<PriceDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState<PriceDraft>(EMPTY_DRAFT);
  const [formProvider, setFormProvider] = useState('');
  const [formModel, setFormModel] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/prices');
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!res.ok) {
        setError(
          typeof json?.message === 'string' && json.message.length > 0
            ? json.message
            : 'Không tải được bảng giá.',
        );
        return;
      }
      const prices = Array.isArray(json?.prices) ? json.prices : [];
      setRows(
        prices
          .filter(
            (item): item is Record<string, unknown> =>
              typeof item === 'object' && item !== null,
          )
          .map(normalizePriceRow)
          .filter((row): row is PriceRow => row !== null),
      );
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** PUT /api/admin/prices — dùng cho cả thêm mới lẫn sửa giá inline. */
  async function putPrice(provider: string, model: string, priceDraft: PriceDraft): Promise<boolean> {
    const payload = buildPricePayload(provider, model, priceDraft);
    if (!payload.ok) {
      setNotice({ kind: 'error', text: payload.message });
      return false;
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload.body),
      });
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!res.ok) {
        setNotice({
          kind: 'error',
          text:
            typeof json?.message === 'string' && json.message.length > 0
              ? json.message
              : 'Không lưu được giá.',
        });
        return false;
      }
      setNotice({ kind: 'ok', text: 'Đã lưu giá model.' });
      return true;
    } catch {
      setNotice({ kind: 'error', text: 'Lỗi kết nối. Vui lòng thử lại.' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(provider: string, model: string) {
    const done = await putPrice(provider, model, draft);
    if (done) {
      setEditingKey(null);
      setDraft(EMPTY_DRAFT);
      await load();
    }
  }

  async function handleAdd() {
    const done = await putPrice(formProvider, formModel, form);
    if (done) {
      setFormProvider('');
      setFormModel('');
      setForm(EMPTY_DRAFT);
      await load();
    }
  }

  async function handleDelete(row: PriceRow) {
    if (!window.confirm('Xóa giá của model này khỏi bảng giá?')) {
      return;
    }
    setDeleting(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/prices', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: row.provider, model: row.model }),
      });
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!res.ok) {
        setNotice({
          kind: 'error',
          text:
            typeof json?.message === 'string' && json.message.length > 0
              ? json.message
              : 'Không xóa được giá.',
        });
        return;
      }
      setNotice({ kind: 'ok', text: 'Đã xóa giá khỏi bảng giá.' });
      if (editingKey === `${row.provider}::${row.model}`) {
        setEditingKey(null);
      }
      await load();
    } catch {
      setNotice({ kind: 'error', text: 'Lỗi kết nối. Vui lòng thử lại.' });
    } finally {
      setDeleting(false);
    }
  }

  /** POST /api/admin/prices/sync — đồng bộ giá từ nguồn ngoài. */
  async function handleSync(source: 'gateway' | 'litellm') {
    setSyncing(source);
    setNotice(null);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/prices/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      const json = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!res.ok) {
        setNotice({
          kind: 'error',
          text:
            typeof json?.message === 'string' && json.message.length > 0
              ? json.message
              : 'Không đồng bộ được bảng giá.',
        });
        return;
      }
      setSyncResult({
        source,
        upserted: toNumber(json?.upserted),
        skipped: toNumber(json?.skipped),
      });
      await load();
    } catch {
      setNotice({ kind: 'error', text: 'Lỗi kết nối. Vui lòng thử lại.' });
    } finally {
      setSyncing(null);
    }
  }

  const busy = saving || deleting || syncing !== null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Bảng giá model</CardTitle>
            <CardDescription className="mt-1">
              Giá theo đơn vị USD / 1 triệu token. Cost được tính lúc ghi
              usage — sửa giá chỉ ảnh hưởng các lần gọi sau.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSync('gateway')}
              disabled={busy}
            >
              {syncing === 'gateway' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCcw size={14} />
              )}
              Đồng bộ từ AI Gateway
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSync('litellm')}
              disabled={busy}
            >
              {syncing === 'litellm' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CloudDownload size={14} />
              )}
              Cào giá từ LiteLLM
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Không tải được bảng giá</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                Thử lại
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {notice && (
          <Alert variant={notice.kind === 'ok' ? undefined : 'destructive'}>
            <AlertTitle>{notice.kind === 'ok' ? 'Thành công' : 'Lỗi'}</AlertTitle>
            <AlertDescription>{notice.text}</AlertDescription>
          </Alert>
        )}

        {syncResult && (
          <Alert>
            <AlertTitle>Đồng bộ hoàn tất</AlertTitle>
            <AlertDescription>
              {syncResult.source === 'gateway'
                ? 'Đồng bộ từ AI Gateway — '
                : 'Cào giá từ LiteLLM — '}
              đã cập nhật <span className="font-medium">{syncResult.upserted}</span>{' '}
              model, bỏ qua <span className="font-medium">{syncResult.skipped}</span>.
            </AlertDescription>
          </Alert>
        )}

        {loading && !rows ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : rows && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Input ($/1M)</TableHead>
                  <TableHead className="text-right">Cached input ($/1M)</TableHead>
                  <TableHead className="text-right">Output ($/1M)</TableHead>
                  <TableHead>Nguồn</TableHead>
                  <TableHead>Cập nhật</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const rowKey = `${row.provider}::${row.model}`;
                  const editing = editingKey === rowKey;
                  const badge = SOURCE_BADGES[row.source];
                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="font-mono text-xs">
                        {row.provider}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.model}
                      </TableCell>
                      {editing ? (
                        <>
                          <TableCell>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={draft.input}
                              onChange={(e) =>
                                setDraft({ ...draft, input: e.target.value })
                              }
                              aria-label="Giá đầu vào"
                              className="w-24 text-right"
                              disabled={busy}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={draft.cached}
                              onChange={(e) =>
                                setDraft({ ...draft, cached: e.target.value })
                              }
                              placeholder="—"
                              aria-label="Giá input cache"
                              className="w-24 text-right"
                              disabled={busy}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              value={draft.output}
                              onChange={(e) =>
                                setDraft({ ...draft, output: e.target.value })
                              }
                              aria-label="Giá đầu ra"
                              className="w-24 text-right"
                              disabled={busy}
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(row.updatedAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon-xs"
                                aria-label="Lưu giá"
                                onClick={() =>
                                  void handleSaveEdit(row.provider, row.model)
                                }
                                disabled={busy}
                              >
                                {saving ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Save size={12} />
                                )}
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label="Bỏ chỉnh sửa"
                                onClick={() => {
                                  setEditingKey(null);
                                  setDraft(EMPTY_DRAFT);
                                }}
                                disabled={busy}
                              >
                                <X size={12} />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-right tabular-nums">
                            {formatPrice(row.inputPerMillion)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.cachedInputPerMillion === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              formatPrice(row.cachedInputPerMillion)
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPrice(row.outputPerMillion)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(row.updatedAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label="Sửa giá"
                                onClick={() => {
                                  setEditingKey(rowKey);
                                  setDraft(draftFromRow(row));
                                }}
                                disabled={busy}
                              >
                                <Pencil size={12} />
                              </Button>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                aria-label="Xóa giá"
                                onClick={() => void handleDelete(row)}
                                disabled={busy}
                              >
                                {deleting ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Trash2 size={12} />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          !error && (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Chưa có giá nào trong bảng — đồng bộ từ AI Gateway/LiteLLM hoặc
              nhập tay bên dưới.
            </div>
          )
        )}

        <div className="space-y-3 rounded-xl border p-4">
          <div>
            <p className="text-sm font-medium">Thêm / cập nhật giá thủ công</p>
            <p className="text-xs text-muted-foreground">
              Model đã có giá sẽ được ghi đè. Nguồn của bản ghi chuyển thành
              “Nhập tay”.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Input
                value={formProvider}
                onChange={(e) => setFormProvider(e.target.value)}
                placeholder="Provider (vd: openai)"
                maxLength={100}
                aria-label="Provider"
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Input
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
                placeholder="Model (vd: gpt-4o)"
                maxLength={200}
                aria-label="Model"
                disabled={busy}
              />
            </div>
            <Input
              type="number"
              step="any"
              min="0"
              value={form.input}
              onChange={(e) => setForm({ ...form, input: e.target.value })}
              placeholder="Giá input ($/1M)"
              aria-label="Giá đầu vào"
              disabled={busy}
            />
            <Input
              type="number"
              step="any"
              min="0"
              value={form.cached}
              onChange={(e) => setForm({ ...form, cached: e.target.value })}
              placeholder="Giá cached ($/1M, tùy chọn)"
              aria-label="Giá input cache"
              disabled={busy}
            />
            <Input
              type="number"
              step="any"
              min="0"
              value={form.output}
              onChange={(e) => setForm({ ...form, output: e.target.value })}
              placeholder="Giá output ($/1M)"
              aria-label="Giá đầu ra"
              disabled={busy}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleAdd()}
            disabled={
              busy ||
              formProvider.trim().length === 0 ||
              formModel.trim().length === 0
            }
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Lưu giá
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
