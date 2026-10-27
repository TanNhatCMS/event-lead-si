'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kit/ui/select';
import { Separator } from '@kit/ui/separator';
import { Skeleton } from '@kit/ui/skeleton';
import { Switch } from '@kit/ui/switch';
import { Textarea } from '@kit/ui/textarea';

type AiModelConfigSource = 'database' | 'env';

interface DirectProviderCatalogEntry {
  id: string;
  label: string;
  apiKeyEnv: string;
  supportsBaseUrl: boolean;
  models: string[];
  /** Model có khả năng đọc ảnh (dùng cho nhận dạng danh thiếp). */
  visionModels: string[];
  /** Model embedding (dùng cho RAG) — rỗng với provider không hỗ trợ. */
  embeddingModels: string[];
}

interface ModelCatalog {
  /** 'gateway' khi danh sách hợp nhất từ AI Gateway thật, 'static' khi là danh sách gợi ý. */
  source: 'gateway' | 'static';
  directProviders: DirectProviderCatalogEntry[];
  openaiModels: string[];
  gatewayModels: string[];
  visionModels: string[];
  embeddingModels: string[];
}

const EMPTY_CATALOG: ModelCatalog = {
  source: 'static',
  directProviders: [],
  openaiModels: [],
  gatewayModels: [],
  visionModels: [],
  embeddingModels: [],
};

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
  catalog: ModelCatalog;
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

interface ProviderOption {
  value: string;
  label: string;
  hint: string;
  supportsBaseUrl: boolean;
  baseUrlRequired?: boolean;
}

const GATEWAY_OPTION: ProviderOption = {
  value: 'gateway',
  label: 'AI Gateway — một key cho mọi nhà cung cấp',
  hint: 'Cần AI_GATEWAY_API_KEY. Model dạng "openai/gpt-4o", "anthropic/claude-sonnet-4-5"…',
  supportsBaseUrl: false,
};

/** Provider trực tiếp có SDK hỗ trợ embedding (khớp server model-config). */
const EMBEDDING_DIRECT_IDS = ['openai', 'google', 'mistral', 'cohere'];

/**
 * Lựa chọn nhà cung cấp theo ngữ cảnh từng capability — khớp với cách
 * `lib/ai/model-config.ts` và `lib/ai/vision-provider.ts` tiêu thụ config.
 */
function getProviderOptions(
  capability: string,
  catalog: ModelCatalog,
): ProviderOption[] {
  if (capability === 'card_recognition') {
    const direct: ProviderOption[] = catalog.directProviders.map((entry) => ({
      value: entry.id,
      label: `${entry.label} (trực tiếp)`,
      hint: `Gọi thẳng ${entry.label} — cần ${entry.apiKeyEnv} trên server. ${
        entry.visionModels.length > 0
          ? 'Danh sách gợi ý đã lọc model có khả năng đọc ảnh.'
          : 'Không có model đọc ảnh gợi ý — chọn “Nhập model khác…”.'
      }`,
      supportsBaseUrl: entry.supportsBaseUrl,
    }));

    return [
      {
        value: 'mock',
        label: 'Mock — mô phỏng, không tốn phí',
        hint: 'Trả dữ liệu danh thiếp mẫu, không gọi AI thật. Phù hợp demo/chưa có key.',
        supportsBaseUrl: false,
      },
      ...direct,
      {
        value: 'vision',
        label: 'Vision — model AI qua AI Gateway',
        hint: 'Cần AI_GATEWAY_API_KEY trên server. Một key cho mọi nhà cung cấp; model dạng "openai/gpt-4o".',
        supportsBaseUrl: false,
      },
    ];
  }
  if (capability === 'rag_embeddings') {
    // Chỉ provider có SDK hỗ trợ embedding mới được chọn trực tiếp.
    const direct: ProviderOption[] = catalog.directProviders
      .filter(
        (entry) =>
          entry.embeddingModels.length > 0 ||
          EMBEDDING_DIRECT_IDS.includes(entry.id),
      )
      .map((entry) => ({
        value: entry.id,
        label: `${entry.label} (trực tiếp)`,
        hint: `Gọi thẳng ${entry.label} — cần ${entry.apiKeyEnv} trên server. Chú ý kích thước vector của model phải khớp index RAG hiện có.`,
        supportsBaseUrl: entry.supportsBaseUrl,
      }));

    return [
      ...direct,
      {
        value: 'openai-compatible',
        label: 'OpenAI-compatible (tuỳ chỉnh)',
        hint: 'Trỏ tới endpoint tương thích OpenAI (proxy/self-host). Cần Base URL; model nhập tay.',
        supportsBaseUrl: true,
        baseUrlRequired: true,
      },
      {
        value: 'gateway',
        label: 'AI Gateway',
        hint: 'Cần AI_GATEWAY_API_KEY. Một key cho mọi nhà cung cấp; model dạng "openai/text-embedding-3-small".',
        supportsBaseUrl: false,
      },
    ];
  }

  const directOptions: ProviderOption[] = catalog.directProviders.map(
    (entry) => ({
      value: entry.id,
      label: entry.label,
      hint: `Cần ${entry.apiKeyEnv} trên server. Chọn model ở ô bên cạnh hoặc nhập model khác.`,
      supportsBaseUrl: entry.supportsBaseUrl,
    }),
  );

  return [
    ...directOptions,
    {
      value: 'openai-compatible',
      label: 'OpenAI-compatible (tuỳ chỉnh)',
      hint: 'Trỏ tới endpoint tương thích OpenAI (proxy/self-host). Cần Base URL; model nhập tay.',
      supportsBaseUrl: true,
      baseUrlRequired: true,
    },
    GATEWAY_OPTION,
  ];
}

/** Danh sách model gợi ý theo capability + provider đang chọn ([] = nhập tay). */
function getModelOptions(
  capability: string,
  provider: string,
  catalog: ModelCatalog,
): string[] {
  if (capability === 'card_recognition') {
    if (provider === 'vision') return catalog.visionModels;
    if (provider === 'mock') return [];
    return (
      catalog.directProviders.find((entry) => entry.id === provider)
        ?.visionModels ?? []
    );
  }
  if (capability === 'rag_embeddings') {
    if (provider === 'gateway') return catalog.embeddingModels;
    if (provider === 'openai-compatible') return [];
    return (
      catalog.directProviders.find((entry) => entry.id === provider)
        ?.embeddingModels ?? []
    );
  }
  if (provider === 'gateway') {
    return catalog.gatewayModels;
  }
  if (provider === 'openai-compatible') {
    return [];
  }
  return (
    catalog.directProviders.find((entry) => entry.id === provider)?.models ?? []
  );
}

const NO_MODEL_VALUE = '__none__';
const CUSTOM_MODEL_VALUE = '__custom__';

/**
 * Giá trị provider từ env/DB có thể không khớp lựa chọn của form (vd "AI
 * Gateway" từ env fallback) — chuẩn hóa về option gần nhất để Select hiển thị
 * đúng và submit giá trị hợp lệ.
 */
function normalizeInitialProvider(
  capability: string,
  raw: string,
  catalog: ModelCatalog,
): string {
  const options = getProviderOptions(capability, catalog);
  if (options.some((o) => o.value === raw)) return raw;
  const value = raw.trim().toLowerCase();
  if (value.includes('gateway')) return 'gateway';
  if (options.some((o) => o.value === value)) return value;
  return options[0]?.value ?? raw;
}

/**
 * Form chỉnh sửa cấu hình model cho một capability.
 * Lưu qua POST /api/ai-models, xóa qua DELETE /api/ai-models.
 * Cột `config` chỉ chứa tham số KHÔNG nhạy cảm — không nhập API key/secret.
 */
function CapabilityForm({
  status,
  catalog,
  onChanged,
}: {
  status: CapabilityStatus;
  catalog: ModelCatalog;
  onChanged: () => void;
}) {
  const [provider, setProvider] = useState(status.provider);
  const [customModel, setCustomModel] = useState(false);
  const [model, setModel] = useState(status.model ?? '');
  const [enabled, setEnabled] = useState(status.enabled);
  const [baseUrl, setBaseUrl] = useState('');
  const [configJson, setConfigJson] = useState(status.configJson);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // base_url nằm trong config JSON nhưng có ô riêng — tách ra lúc mount.
  useEffect(() => {
    if (status.configJson.trim().length === 0) return;
    try {
      const parsed = JSON.parse(status.configJson) as Record<string, unknown>;
      if (typeof parsed.base_url === 'string') {
        setBaseUrl(parsed.base_url);
        const rest = { ...parsed };
        delete rest.base_url;
        setConfigJson(
          Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : '',
        );
      }
    } catch {
      // JSON lỗi để người dùng tự sửa trong ô JSON, không chặn form.
    }
  }, [status.configJson]);

  const providerOptions = useMemo(
    () => getProviderOptions(status.capability, catalog),
    [status.capability, catalog],
  );

  const modelOptions = useMemo(
    () => getModelOptions(status.capability, provider, catalog),
    [status.capability, provider, catalog],
  );

  const activeProviderOption = providerOptions.find(
    (o) => o.value === provider,
  );

  // Provider khởi tạo có thể chưa khớp option — sửa dùng catalog thật khi sẵn.
  useEffect(() => {
    setProvider((current) =>
      normalizeInitialProvider(status.capability, current, catalog),
    );
  }, [status.capability, catalog]);

  // Provider không có danh sách gợi ý (trừ mock) → bật chế độ nhập tay.
  useEffect(() => {
    if (modelOptions.length === 0 && provider !== 'mock') {
      setCustomModel(true);
    }
  }, [modelOptions.length, provider]);

  const providerHint = activeProviderOption?.hint ?? '';
  const showBaseUrl = activeProviderOption?.supportsBaseUrl ?? false;

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
    const trimmedBaseUrl = baseUrl.trim();
    if (trimmedBaseUrl.length > 0) {
      config = { ...config, base_url: trimmedBaseUrl };
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
          <Label htmlFor={`provider-${status.capability}`}>Nhà cung cấp</Label>
          <Select
            value={provider}
            onValueChange={(value) => {
              if (value === null) return;
              setProvider(value);
              setCustomModel(false);
              // Đổi provider → danh sách model đổi; giữ model nếu vẫn hợp lệ,
              // ngược lại xóa trắng để người dùng chọn lại.
              if (!getModelOptions(status.capability, value, catalog).includes(model)) {
                setModel('');
              }
            }}
            disabled={saving}
          >
            <SelectTrigger id={`provider-${status.capability}`} className="w-full">
              <SelectValue placeholder="Chọn nhà cung cấp">
                {activeProviderOption?.label ?? provider}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {providerOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              {!providerOptions.some((o) => o.value === provider) && (
                <SelectItem value={provider}>{provider}</SelectItem>
              )}
            </SelectContent>
          </Select>
          {providerHint && (
            <p className="text-xs text-muted-foreground">{providerHint}</p>
          )}
        </div>

        {modelOptions.length > 0 && !customModel ? (
          <div className="space-y-1.5">
            <Label htmlFor={`model-${status.capability}`}>
              Model{' '}
              <span className="font-normal">
                ({catalog.source === 'gateway' ? 'danh sách từ AI Gateway' : 'danh sách gợi ý'})
              </span>
            </Label>
            <Select
              value={
                model
                  ? modelOptions.includes(model)
                    ? model
                    : CUSTOM_MODEL_VALUE
                  : NO_MODEL_VALUE
              }
              onValueChange={(value) => {
                if (value === null) return;
                if (value === CUSTOM_MODEL_VALUE) {
                  setCustomModel(true);
                  return;
                }
                setModel(value === NO_MODEL_VALUE ? '' : value);
              }}
              disabled={saving}
            >
              <SelectTrigger id={`model-${status.capability}`} className="w-full">
                <SelectValue placeholder="Chọn model">
                  {model || undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MODEL_VALUE}>
                  — Không chọn (dùng mặc định của provider) —
                </SelectItem>
                {modelOptions.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_MODEL_VALUE}>
                  Nhập model khác…
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : provider !== 'mock' ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`model-${status.capability}`}>Model</Label>
              {modelOptions.length > 0 && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => setCustomModel(false)}
                  disabled={saving}
                >
                  Chọn từ danh sách
                </Button>
              )}
            </div>
            <Input
              id={`model-${status.capability}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="vd: gpt-4o, anthropic/claude-sonnet-4-5"
              maxLength={200}
              disabled={saving}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Model</Label>
            <p className="text-sm text-muted-foreground">
              Provider này không cần chọn model.
            </p>
          </div>
        )}
      </div>

      {showBaseUrl && (
        <div className="space-y-1.5">
          <Label htmlFor={`base-url-${status.capability}`}>
            Base URL{' '}
            <span className="font-normal">
              {activeProviderOption?.baseUrlRequired ? '(bắt buộc)' : '(tùy chọn)'}
            </span>
          </Label>
          <Input
            id={`base-url-${status.capability}`}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1 (bỏ trống = mặc định của provider)"
            inputMode="url"
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            Dùng khi trỏ sang proxy hoặc endpoint tương thích. Lưu vào
            config.base_url.
          </p>
        </div>
      )}

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
          Cấu hình JSON <span className="font-normal">(nâng cao, tùy chọn)</span>
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
  catalog,
  onChanged,
}: {
  status: CapabilityStatus;
  catalog: ModelCatalog;
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
          catalog={catalog}
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
      setData({
        configs: json.configs ?? [],
        capabilities: json.capabilities ?? [],
        catalog: json.catalog ?? EMPTY_CATALOG,
      });
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
        provider: 'openai',
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
      {data.catalog.source === 'static' && (
        <p className="text-xs text-muted-foreground">
          Không tải được danh sách model từ AI Gateway — đang dùng danh sách
          gợi ý offline. Luôn có thể chọn “Nhập model khác…” để dùng model bất
          kỳ.
        </p>
      )}

      {data.capabilities.map((status) => (
        <CapabilityCard
          key={status.capability}
          status={status}
          catalog={data.catalog}
          onChanged={load}
        />
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
          catalog={data.catalog}
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
                catalog={data.catalog}
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
