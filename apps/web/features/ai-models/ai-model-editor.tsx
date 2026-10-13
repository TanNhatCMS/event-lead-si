'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Database,
  Loader2,
  Plus,
  Save,
  Terminal,
  Trash2,
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
import { Label } from '@kit/ui/label';
import { Separator } from '@kit/ui/separator';
import { Skeleton } from '@kit/ui/skeleton';
import { Switch } from '@kit/ui/switch';
import { Textarea } from '@kit/ui/textarea';

type AiModelConfigSource = 'database' | 'env';

interface CapabilityStatus {
  capability: string;
  label: string;
  description: string;
  /** Cấu hình đang có hiệu lực (DB ưu tiên, env fallback). */
  provider: string;
  model: string | null;
  enabled: boolean;
  source: AiModelConfigSource;
  /** Trạng thái env hiện tại của server (để so sánh với DB). */
  envProvider: string;
  envModel: string | null;
  envEnabled: boolean;
  /** Config JSON hiện có trong DB (chuỗi đã stringify, "" nếu chưa có). */
  configJson: string;
  /** updated_at của dòng DB, null khi chưa có dòng nào. */
  updatedAt: string | null;
}

interface AiModelConfigRow {
  id: string;
  user_id: string;
  capability: string;
  provider: string;
  model: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface EditorData {
  configs: AiModelConfigRow[];
  capabilities: CapabilityStatus[];
}

function SourceBadge({ source }: { source: AiModelConfigSource }) {
  if (source === 'database') {
    return (
      <Badge variant="secondary" className="gap-1">
        <Database size={12} />
        Lưu trong DB
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Terminal size={12} />
      Biến môi trường
    </Badge>
  );
}

/**
 * Form chỉnh sửa cấu hình model cho một capability.
 * Lưu qua POST /api/ai-models, xóa qua DELETE /api/ai-models.
 * Cột `config` chỉ chứa tham số KHÔNG nhạy cảm — không nhập API key/secret.
 */
function CapabilityForm({
  status,
  onChanged,
}: {
  status: CapabilityStatus;
  onChanged: () => void;
}) {
  const [provider, setProvider] = useState(status.provider);
  const [model, setModel] = useState(status.model ?? '');
  const [enabled, setEnabled] = useState(status.enabled);
  const [configJson, setConfigJson] = useState(status.configJson);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setError(null);
    setSuccess(null);

    let config: Record<string, unknown> = {};
    const trimmed = configJson.trim();
    if (trimmed.length > 0) {
      try {
        const value: unknown = JSON.parse(trimmed);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          setError(
            'Cấu hình JSON phải là một object (ví dụ {"timeout_ms": 30000}).',
          );
          return;
        }
        config = value as Record<string, unknown>;
      } catch {
        setError('Cấu hình JSON không hợp lệ. Kiểm tra lại cú pháp.');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/ai-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capability: status.capability,
          provider: provider.trim(),
          model: model.trim() || null,
          enabled,
          config,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!res.ok) {
        setError(json?.message ?? 'Không lưu được cấu hình.');
        return;
      }
      setSuccess('Đã lưu cấu hình mô hình AI.');
      onChanged();
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Xóa cấu hình "${status.capability}" trong DB và quay về dùng biến môi trường?`,
      )
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    setDeleting(true);
    try {
      const res = await fetch('/api/ai-models', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability: status.capability }),
      });
      const json = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!res.ok) {
        setError(json?.message ?? 'Không xóa được cấu hình.');
        return;
      }
      setSuccess('Đã xóa cấu hình, quay về dùng biến môi trường.');
      onChanged();
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setDeleting(false);
    }
  }

  const envLine = `${status.envProvider}${
    status.envModel ? ` · ${status.envModel}` : ''
  } · ${status.envEnabled ? 'bật' : 'tắt'}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            Provider hiện tại
          </p>
          <p className="mt-0.5 text-sm font-semibold">{status.provider}</p>
        </div>
        <div className="rounded-xl bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Model</p>
          <p className="mt-0.5 text-sm font-semibold">{status.model ?? '—'}</p>
        </div>
        <div className="rounded-xl bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">Trạng thái</p>
          <p className="mt-0.5">
            <Badge variant={status.enabled ? 'default' : 'secondary'}>
              {status.enabled ? 'Đang bật' : 'Đang tắt'}
            </Badge>
          </p>
        </div>
        <div className="rounded-xl bg-muted px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            Env server hiện tại
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{envLine}</p>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`provider-${status.capability}`}>Provider</Label>
          <Input
            id={`provider-${status.capability}`}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="mock"
            maxLength={80}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            Tên provider. Với nhận dạng danh thiếp: “mock” dùng dữ liệu mẫu,
            “vision” dùng model AI đọc ảnh thật (cần AI_GATEWAY_API_KEY và model
            có khả năng xem ảnh, ví dụ “openai/gpt-4o”).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`model-${status.capability}`}>
            Tên model <span className="font-normal">(tùy chọn)</span>
          </Label>
          <Input
            id={`model-${status.capability}`}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="vd: gpt-4o-mini"
            maxLength={200}
            disabled={saving}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
        <div>
          <p className="text-sm font-medium">Bật capability</p>
          <p className="text-xs text-muted-foreground">
            Tắt để chặn gọi AI cho năng lực này (route trả 503).
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={saving}
          aria-label="Bật capability"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`config-${status.capability}`}>
          Cấu hình JSON <span className="font-normal">(tùy chọn, phải là object)</span>
        </Label>
        <Textarea
          id={`config-${status.capability}`}
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
          placeholder='{"timeout_ms": 30000}'
          rows={3}
          className="font-mono text-xs"
          disabled={saving}
        />
        <p className="text-xs text-muted-foreground">
          Chỉ tham số không nhạy cảm. Tuyệt đối không nhập API key/secret vào đây.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertTitle>Thành công</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={saving || deleting}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Lưu cấu hình
        </Button>
        {status.source === 'database' && (
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={saving || deleting}
          >
            {deleting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}
            Xóa (về env)
          </Button>
        )}
      </div>
    </div>
  );
}

function CapabilityCard({
  status,
  onChanged,
}: {
  status: CapabilityStatus;
  onChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{status.label}</CardTitle>
            <CardDescription className="mt-1">
              {status.description}
            </CardDescription>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {status.capability}
            </p>
          </div>
          <SourceBadge source={status.source} />
        </div>
      </CardHeader>
      <CardContent>
        <CapabilityForm
          key={`${status.capability}::${status.updatedAt ?? 'none'}`}
          status={status}
          onChanged={onChanged}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Trang quản lý mô hình AI (client).
 * Tải danh sách cấu hình từ GET /api/ai-models, chỉnh sửa từng capability
 * (card_recognition, lead_enrichment và capability tùy ý trong DB).
 */
export function AiModelEditor() {
  const [data, setData] = useState<EditorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCapability, setNewCapability] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-models');
      const json = (await res.json().catch(() => null)) as
        | (EditorData & { message?: string })
        | null;
      if (!res.ok || !json) {
        setError(json?.message ?? 'Không tải được danh sách cấu hình.');
        return;
      }
      setData({ configs: json.configs ?? [], capabilities: json.capabilities ?? [] });
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-5">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl border p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Không tải được cấu hình</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{error ?? 'Đã có lỗi xảy ra.'}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Thử lại
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const knownIds = new Set(data.capabilities.map((c) => c.capability));
  const extraRows = data.configs.filter((row) => !knownIds.has(row.capability));
  const trimmedNew = newCapability.trim();
  const canAdd =
    trimmedNew.length > 0 &&
    !knownIds.has(trimmedNew) &&
    !data.configs.some((row) => row.capability === trimmedNew);

  const draftStatus: CapabilityStatus | null = canAdd
    ? {
        capability: trimmedNew,
        label: trimmedNew,
        description: 'Capability tùy chỉnh (chưa lưu).',
        provider: 'mock',
        model: null,
        enabled: true,
        source: 'env',
        envProvider: '—',
        envModel: null,
        envEnabled: false,
        configJson: '',
        updatedAt: null,
      }
    : null;

  return (
    <div className="space-y-5">
      {data.capabilities.map((status) => (
        <CapabilityCard key={status.capability} status={status} onChanged={load} />
      ))}

      {extraRows.map((row) => (
        <CapabilityCard
          key={row.capability}
          status={{
            capability: row.capability,
            label: row.capability,
            description: 'Capability tùy chỉnh đã lưu trong DB.',
            provider: row.provider,
            model: row.model,
            enabled: row.enabled,
            source: 'database',
            envProvider: '—',
            envModel: null,
            envEnabled: false,
            configJson: JSON.stringify(row.config ?? {}, null, 2),
            updatedAt: row.updated_at,
          }}
          onChanged={load}
        />
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Thêm capability mới</CardTitle>
          <CardDescription>
            Nhập tên capability (tối đa 80 ký tự) để tạo cấu hình riêng, ví dụ
            “summarize_notes”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex max-w-md items-center gap-2">
            <Input
              value={newCapability}
              onChange={(e) => setNewCapability(e.target.value)}
              placeholder="ten_capability"
              maxLength={80}
              aria-label="Tên capability mới"
            />
            <Button
              variant="outline"
              disabled={!canAdd}
              onClick={() => setNewCapability((v) => v.trim())}
            >
              <Plus size={16} />
              Tạo form
            </Button>
          </div>
          {!canAdd && trimmedNew.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Capability này đã có cấu hình — sửa ở thẻ bên trên.
            </p>
          )}
          {draftStatus && (
            <div className="rounded-xl border border-dashed p-4">
              <CapabilityForm
                key={`draft::${draftStatus.capability}`}
                status={draftStatus}
                onChanged={() => {
                  setNewCapability('');
                  void load();
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
