'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
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
  /** Danh sách model dự phòng (backend đọc từ config.fallbacks; [] khi không có). */
  fallbacks: FallbackEntry[];
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
  keyStates: Record<string, ProviderKeyState>;
  priceIndex: Record<string, ModelPriceEntry>;
}

/** Một dòng giá (USD / 1 triệu token) từ GET /api/admin/prices. */
interface ModelPriceEntry {
  inputPerMillion: number;
  cachedInputPerMillion: number | null;
  outputPerMillion: number;
  source: string;
}

/**
 * Lookup giá cho (provider, model): thử cặp gốc → bản gateway có prefix
 * (`gateway:openai/gpt-5.2` cho model direct của openai) → LiteLLM bare.
 */
function lookupModelPrice(
  priceIndex: Record<string, ModelPriceEntry>,
  provider: string,
  model: string,
): ModelPriceEntry | null {
  return (
    priceIndex[`${provider}:${model}`] ??
    priceIndex[`gateway:${provider}/${model}`] ??
    priceIndex[`litellm:${model}`] ??
    null
  );
}

function formatUsdPerMillion(value: number): string {
  const text = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
  return `$${text}`;
}

/** Nhãn giá gọn cho item dropdown: "in $1.75 · out $14 /1M" hoặc ''. */
function modelPriceLabel(entry: ModelPriceEntry | null): string {
  if (!entry) return '';
  let label =
    'in ' +
    formatUsdPerMillion(entry.inputPerMillion) +
    ' · out ' +
    formatUsdPerMillion(entry.outputPerMillion) +
    ' /1M';
  if (entry.cachedInputPerMillion !== null) {
    label += ' · cache ' + formatUsdPerMillion(entry.cachedInputPerMillion);
  }
  return label;
}

function buildPriceIndex(rows: unknown): Record<string, ModelPriceEntry> {
  const index: Record<string, ModelPriceEntry> = {};
  if (!Array.isArray(rows)) return index;
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const raw = row as Record<string, unknown>;
    const provider = typeof raw.provider === 'string' ? raw.provider.trim() : '';
    const model = typeof raw.model === 'string' ? raw.model.trim() : '';
    const input = raw.inputPerMillion;
    const output = raw.outputPerMillion;
    if (!provider || !model) continue;
    if (typeof input !== 'number' || typeof output !== 'number') continue;
    const cached =
      typeof raw.cachedInputPerMillion === 'number'
        ? raw.cachedInputPerMillion
        : null;
    const entry: ModelPriceEntry = {
      inputPerMillion: input,
      cachedInputPerMillion: cached,
      outputPerMillion: output,
      source: typeof raw.source === 'string' ? raw.source : 'manual',
    };
    index[`${provider}:${model}`] = entry;
  }
  return index;
}

/** Một model dự phòng đã lưu trong config (baseUrl chỉ dùng cho openai-compatible). */
interface FallbackEntry {
  provider: string;
  model: string;
  baseUrl?: string;
}

/** Hàng model dự phòng trong form — `custom` chỉ dùng cho UI (nhập tay), không lưu. */
interface FallbackRow {
  provider: string;
  model: string;
  baseUrl?: string;
  custom?: boolean;
}

/** Trạng thái key của một provider theo GET /api/ai-keys (chỉ nhận bản masked). */
interface ProviderKeyState {
  id: string;
  label: string;
  envName: string;
  /** Danh sách key masked ("***abcd") lưu trong DB — key đầu tiên là key đang dùng. */
  keys: string[];
  /** Key env (masked) được dùng khi DB chưa có key nào. */
  envFallback: string | null;
  count: number;
}

/** Chuẩn hóa danh sách fallback từ dữ liệu backend — bỏ qua phần tử lỗi. */
function toFallbackRows(value: unknown): FallbackRow[] {
  if (!Array.isArray(value)) return [];
  const rows: FallbackRow[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const raw = item as Record<string, unknown>;
    const provider = typeof raw.provider === 'string' ? raw.provider.trim() : '';
    const model = typeof raw.model === 'string' ? raw.model.trim() : '';
    if (provider.length === 0 || model.length === 0) continue;
    const row: FallbackRow = { provider, model, custom: false };
    if (typeof raw.baseUrl === 'string' && raw.baseUrl.trim().length > 0) {
      row.baseUrl = raw.baseUrl.trim();
    }
    rows.push(row);
  }
  return rows;
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
      hint: `Gọi thẳng ${entry.label} — đặt API key ngay ô bên dưới (hỗ trợ nhiều key dự phòng; hoặc env ${entry.apiKeyEnv}). ${
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
        hint: `Gọi thẳng ${entry.label} — đặt API key ngay ô bên dưới (hỗ trợ nhiều key dự phòng; hoặc env ${entry.apiKeyEnv}). Chú ý kích thước vector của model phải khớp index RAG hiện có.`,
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
      hint: `Đặt API key ngay ô bên dưới (hỗ trợ nhiều key dự phòng; hoặc env ${entry.apiKeyEnv}). Chọn model ở ô bên cạnh hoặc nhập model khác.`,
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
  keyStates,
  priceIndex,
  onChanged,
}: {
  status: CapabilityStatus;
  catalog: ModelCatalog;
  keyStates: Record<string, ProviderKeyState>;
  priceIndex: Record<string, ModelPriceEntry>;
  onChanged: () => void;
}) {
  const [provider, setProvider] = useState(status.provider);
  const [customModel, setCustomModel] = useState(false);
  const [model, setModel] = useState(status.model ?? '');
  const [enabled, setEnabled] = useState(status.enabled);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [fallbacks, setFallbacks] = useState<FallbackRow[]>(() =>
    toFallbackRows(status.fallbacks),
  );
  const [configJson, setConfigJson] = useState(status.configJson);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingKeys, setDeletingKeys] = useState(false);

  // base_url và fallbacks nằm trong config JSON nhưng có ô riêng — tách ra lúc
  // mount để người dùng không phải sửa JSON tay, ghép lại lúc Lưu.
  useEffect(() => {
    if (status.configJson.trim().length === 0) return;
    try {
      const parsed = JSON.parse(status.configJson) as Record<string, unknown>;
      const rest = { ...parsed };
      let touched = false;
      if (typeof parsed.base_url === 'string') {
        setBaseUrl(parsed.base_url);
        delete rest.base_url;
        touched = true;
      }
      const parsedFallbacks = toFallbackRows(parsed.fallbacks);
      if (parsedFallbacks.length > 0) {
        setFallbacks(parsedFallbacks);
        delete rest.fallbacks;
        touched = true;
      }
      if (touched) {
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
  // Provider trực tiếp / openai-compatible cho phép đặt key ngay trong form.
  const showApiKeyField =
    provider !== 'mock' && provider !== 'vision' && provider !== 'gateway';
  const providerKeyState = keyStates[provider];
  const savedKeys = providerKeyState?.keys ?? [];
  const envFallback = providerKeyState?.envFallback ?? null;
  const pendingKeys = useMemo(
    () =>
      apiKeyInput
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [apiKeyInput],
  );
  // Provider trực tiếp cần key: DB đã có, env có dự phòng, hoặc đang nhập mới.
  const needsKey =
    showApiKeyField &&
    savedKeys.length === 0 &&
    !envFallback &&
    pendingKeys.length === 0;

  // Lựa chọn provider cho hàng model dự phòng: direct + gateway + openai-compatible.
  const fallbackProviderOptions = useMemo(() => {
    const options: { value: string; label: string }[] = catalog.directProviders.map(
      (entry) => ({ value: entry.id, label: entry.label + ' (trực tiếp)' }),
    );
    options.push({
      value: 'openai-compatible',
      label: 'OpenAI-compatible (tuỳ chỉnh)',
    });
    options.push({ value: 'gateway', label: 'AI Gateway' });
    return options;
  }, [catalog]);

  function updateFallback(index: number, patch: Partial<FallbackRow>) {
    setFallbacks((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function moveFallback(index: number, direction: -1 | 1) {
    setFallbacks((rows) => {
      const target = index + direction;
      const current = rows[index];
      const other = rows[target];
      if (target < 0 || target >= rows.length || !current || !other) return rows;
      const next = [...rows];
      next[index] = other;
      next[target] = current;
      return next;
    });
  }

  function removeFallback(index: number) {
    setFallbacks((rows) => rows.filter((_, i) => i !== index));
  }

  function addFallback() {
    const defaultProvider =
      fallbackProviderOptions[0]?.value ?? 'openai-compatible';
    setFallbacks((rows) => [
      ...rows,
      { provider: defaultProvider, model: '', custom: false },
    ]);
  }

  /** Gom các hàng fallback hợp lệ thành payload lưu vào config.fallbacks. */
  function buildFallbackEntries(): FallbackEntry[] {
    const entries: FallbackEntry[] = [];
    for (const row of fallbacks) {
      const rowProvider = row.provider.trim();
      const rowModel = row.model.trim();
      if (rowProvider.length === 0 || rowModel.length === 0) continue;
      const rowBaseUrl = (row.baseUrl ?? '').trim();
      entries.push(
        rowBaseUrl.length > 0
          ? { provider: rowProvider, model: rowModel, baseUrl: rowBaseUrl }
          : { provider: rowProvider, model: rowModel },
      );
    }
    return entries;
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    if (needsKey) {
      setError('Nhập ít nhất một API key cho provider này để lưu cấu hình.');
      return;
    }

    // Lưu API key (THAY THẾ toàn bộ danh sách của provider) TRƯỚC cấu hình —
    // key là điều kiện để capability chạy được; lỗi key thì dừng, không lưu config.
    if (showApiKeyField && pendingKeys.length > 0) {
      try {
        const keyRes = await fetch('/api/ai-keys', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, keys: pendingKeys }),
        });
        const keyJson = (await keyRes.json().catch(() => null)) as {
          message?: string;
        } | null;
        if (!keyRes.ok) {
          setError(keyJson?.message ?? 'Không lưu được API key.');
          return;
        }
        setApiKeyInput('');
      } catch {
        setError('Lỗi kết nối khi lưu API key. Vui lòng thử lại.');
        return;
      }
    }

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
    // Model dự phòng: gộp vào config (backend lưu nguyên jsonb). Danh sách rỗng
    // nghĩa là xóa fallback — fallbacks đã được tách khỏi configJson lúc mount.
    const fallbackEntries = buildFallbackEntries();
    if (fallbackEntries.length > 0) {
      config = { ...config, fallbacks: fallbackEntries };
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

  /** DELETE /api/ai-keys — gỡ toàn bộ danh sách key DB của provider đang chọn. */
  async function handleDeleteKeys() {
    if (
      !window.confirm(
        'Xóa toàn bộ danh sách API key đã lưu cho provider này? App sẽ quay về dùng key env (nếu có).',
      )
    ) {
      return;
    }
    setError(null);
    setSuccess(null);
    setDeletingKeys(true);
    try {
      const res = await fetch('/api/ai-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!res.ok) {
        setError(json?.message ?? 'Không xóa được API key.');
        return;
      }
      setSuccess('Đã xóa danh sách API key của provider này.');
      onChanged();
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setDeletingKeys(false);
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
              setApiKeyInput('');
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
                {modelOptions.map((id) => {
                  const price = lookupModelPrice(priceIndex, provider, id);
                  const priceLabel = modelPriceLabel(price);
                  return (
                    <SelectItem key={id} value={id}>
                      <span className="flex w-full min-w-0 items-center justify-between gap-3">
                        <span className="truncate font-mono text-xs">{id}</span>
                        {priceLabel && (
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {priceLabel}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  );
                })}
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

      {showApiKeyField && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor={`api-key-${status.capability}`}>
              API key{' '}
              <span className="font-normal">
                {activeProviderOption?.label ?? provider}
              </span>
            </Label>
            {savedKeys.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleDeleteKeys}
                disabled={saving || deletingKeys}
              >
                {deletingKeys ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
                Xóa danh sách key
              </Button>
            )}
          </div>

          {savedKeys.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {savedKeys.map((keyMasked, index) => (
                <Badge
                  key={keyMasked + '-' + index}
                  variant={index === 0 ? 'secondary' : 'outline'}
                >
                  {index === 0 ? 'Đang dùng · ' : 'Dự phòng · '}
                  {keyMasked}
                </Badge>
              ))}
            </div>
          ) : envFallback ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">Đang dùng env: {envFallback}</Badge>
              <span className="text-xs text-muted-foreground">
                {providerKeyState?.envName}
              </span>
            </div>
          ) : null}

          <Textarea
            id={`api-key-${status.capability}`}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="Mỗi dòng một API key — dán nhiều key để dự phòng"
            rows={3}
            className="font-mono text-xs"
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            {savedKeys.length > 0
              ? 'Nhập key mới sẽ thay thế toàn bộ danh sách đã lưu (mỗi dòng một key). '
              : ''}
            Key lưu trong DB của bạn (write-only, không hiển thị lại), ưu tiên
            trước env và dùng chung cho mọi capability dùng provider này. Khi
            một key lỗi (hết hạn mức/sai), app tự chuyển sang key kế tiếp.
          </p>
        </div>
      )}

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

      {provider !== 'mock' && (
        <div className="space-y-2 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Label>Model dự phòng (fallback)</Label>
              <p className="text-xs text-muted-foreground">
                Model dự phòng được thử theo thứ tự khi model chính lỗi (key
                sai, hết hạn mức, model 404…).
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addFallback}
              disabled={saving}
            >
              <Plus size={14} />
              Thêm model dự phòng
            </Button>
          </div>

          {fallbacks.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chưa có model dự phòng — chỉ dùng model chính đã chọn phía trên.
            </p>
          ) : (
            <div className="space-y-2">
              {fallbacks.map((row, index) => {
                const rowModelOptions = getModelOptions(
                  status.capability,
                  row.provider,
                  catalog,
                );
                const useCustomInput =
                  row.custom === true ||
                  rowModelOptions.length === 0 ||
                  (row.model.length > 0 && !rowModelOptions.includes(row.model));
                return (
                  <div
                    key={'fallback-' + index + '-' + row.provider}
                    className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-2 sm:flex-row sm:items-center"
                  >
                    <Select
                      value={row.provider}
                      onValueChange={(value) => {
                        if (!value) return;
                        // Đổi provider → model cũ không còn hợp lệ, xóa trắng.
                        updateFallback(index, {
                          provider: value,
                          model: '',
                          custom: false,
                          baseUrl: undefined,
                        });
                      }}
                      disabled={saving}
                    >
                      <SelectTrigger className="w-full shrink-0 sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fallbackProviderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                        {!fallbackProviderOptions.some(
                          (option) => option.value === row.provider,
                        ) && (
                          <SelectItem value={row.provider}>
                            {row.provider}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>

                    {useCustomInput ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <Input
                          value={row.model}
                          onChange={(e) =>
                            updateFallback(index, { model: e.target.value })
                          }
                          placeholder="Tên model dự phòng"
                          maxLength={200}
                          disabled={saving}
                        />
                        {rowModelOptions.length > 0 && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto shrink-0 p-0 text-xs"
                            onClick={() => updateFallback(index, { custom: false })}
                            disabled={saving}
                          >
                            Chọn từ danh sách
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Select
                        value={
                          rowModelOptions.includes(row.model)
                            ? row.model
                            : NO_MODEL_VALUE
                        }
                        onValueChange={(value) => {
                          if (!value) return;
                          if (value === CUSTOM_MODEL_VALUE) {
                            updateFallback(index, { custom: true });
                            return;
                          }
                          updateFallback(index, { model: value, custom: false });
                        }}
                        disabled={saving}
                      >
                        <SelectTrigger className="w-full sm:flex-1">
                          <SelectValue placeholder="Chọn model" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_MODEL_VALUE}>
                            — Chọn model —
                          </SelectItem>
                          {rowModelOptions.map((id) => {
                            const fallbackPrice = lookupModelPrice(
                              priceIndex,
                              row.provider,
                              id,
                            );
                            const fallbackPriceLabel = modelPriceLabel(fallbackPrice);
                            return (
                              <SelectItem key={id} value={id}>
                                <span className="flex w-full min-w-0 items-center justify-between gap-3">
                                  <span className="truncate font-mono text-xs">{id}</span>
                                  {fallbackPriceLabel && (
                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                      {fallbackPriceLabel}
                                    </span>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                          <SelectItem value={CUSTOM_MODEL_VALUE}>
                            Nhập model khác…
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {row.provider === 'openai-compatible' && (
                      <Input
                        value={row.baseUrl ?? ''}
                        onChange={(e) =>
                          updateFallback(index, { baseUrl: e.target.value })
                        }
                        placeholder="Base URL (bắt buộc với openai-compatible)"
                        inputMode="url"
                        maxLength={500}
                        disabled={saving}
                        className="w-full sm:w-64"
                      />
                    )}

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Chuyển model dự phòng lên trên"
                        onClick={() => moveFallback(index, -1)}
                        disabled={saving || index === 0}
                      >
                        <ArrowUp size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Chuyển model dự phòng xuống dưới"
                        onClick={() => moveFallback(index, 1)}
                        disabled={saving || index === fallbacks.length - 1}
                      >
                        <ArrowDown size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Xóa model dự phòng"
                        onClick={() => removeFallback(index)}
                        disabled={saving}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
        <Button onClick={handleSave} disabled={saving || deleting || needsKey}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {needsKey ? 'Nhập API key để lưu' : 'Lưu cấu hình'}
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
  keyStates,
  priceIndex,
  onChanged,
}: {
  status: CapabilityStatus;
  catalog: ModelCatalog;
  keyStates: Record<string, ProviderKeyState>;
  priceIndex: Record<string, ModelPriceEntry>;
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
          keyStates={keyStates}
          priceIndex={priceIndex}
          onChanged={onChanged}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ngân sách chi phí theo capability (agent_config.budgets)
// ---------------------------------------------------------------------------

/** Các capability chính được đặt ngưỡng — khớp capability thật của app. */
const BUDGET_CAPABILITIES: Array<{ id: string; label: string }> = [
  { id: 'card_recognition', label: 'Nhận dạng danh thiếp' },
  { id: 'lead_enrichment', label: 'Làm giàu lead' },
  { id: 'followup_draft', label: 'Soạn follow-up' },
  { id: 'sourcing_assist', label: 'Hỗ trợ sourcing' },
  { id: 'rag_chat', label: 'Chat RAG' },
  { id: 'rag_embeddings', label: 'Embeddings RAG' },
];

/**
 * Section "Ngân sách chi phí" — ngưỡng USD/tháng cho từng capability.
 * Lưu qua PATCH /api/agent/config { budgets } — ô trống = không giới hạn
 * (gửi `monthly_usd: null` để xóa ngưỡng đã lưu).
 */
function BudgetsSection() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/config');
      const json = (await res.json().catch(() => null)) as {
        budgets?: Record<string, { monthly_usd?: number }>;
      } | null;
      if (res.ok && json) {
        const next: Record<string, string> = {};
        for (const { id } of BUDGET_CAPABILITIES) {
          const usd = json.budgets?.[id]?.monthly_usd;
          next[id] = typeof usd === 'number' ? String(usd) : '';
        }
        setValues(next);
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    setError(null);
    setSuccess(null);

    const budgets: Record<string, { monthly_usd: number | null }> = {};
    for (const { id } of BUDGET_CAPABILITIES) {
      const raw = (values[id] ?? '').trim();
      if (raw.length === 0) {
        budgets[id] = { monthly_usd: null };
        continue;
      }
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        setError('Ngân sách phải là số không âm (USD/tháng).');
        return;
      }
      budgets[id] = { monthly_usd: num };
    }

    setSaving(true);
    try {
      const res = await fetch('/api/agent/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgets }),
      });
      const json = (await res.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!res.ok) {
        setError(json?.message ?? 'Không lưu được ngân sách.');
        return;
      }
      setSuccess('Đã lưu ngân sách chi phí.');
    } catch {
      setError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ngân sách chi phí</CardTitle>
        <CardDescription>
          Giới hạn chi phí USD/tháng cho từng capability AI. Ô trống = không
          giới hạn. Vượt ngưỡng tháng hiện tại → capability tự tắt + ghi audit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!loaded ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BUDGET_CAPABILITIES.map(({ id, label }) => (
                <div key={id} className="space-y-1.5">
                  <Label htmlFor={'budget-' + id}>{label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={'budget-' + id}
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={values[id] ?? ''}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [id]: e.target.value }))
                      }
                      placeholder="Không giới hạn"
                      disabled={saving}
                      className="w-full"
                    />
                    <span className="text-sm text-muted-foreground">
                      USD/tháng
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="text-sm text-emerald-600" role="status">
                {success}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" disabled={saving} onClick={() => void handleSave()}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Lưu ngân sách
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => void load()}
              >
                Làm mới
              </Button>
            </div>
          </>
        )}
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
      const [modelsRes, keysRes, pricesRes] = await Promise.all([
        fetch('/api/ai-models'),
        fetch('/api/ai-keys').catch(() => null),
        fetch('/api/admin/prices').catch(() => null),
      ]);
      const json = (await modelsRes.json().catch(() => null)) as
        | (EditorData & { message?: string })
        | null;
      if (!modelsRes.ok || !json) {
        setError(json?.message ?? 'Không tải được danh sách cấu hình.');
        return;
      }

      // GET /api/admin/prices lỗi không chặn trang — chỉ mất nhãn giá trên
      // danh sách model.
      // GET /api/ai-keys lỗi không chặn trang — chỉ mất badge trạng thái key.
      const keyStates: Record<string, ProviderKeyState> = {};
      if (keysRes && keysRes.ok) {
        const keysJson = (await keysRes.json().catch(() => null)) as {
          providers?: ProviderKeyState[];
        } | null;
        for (const entry of keysJson?.providers ?? []) {
          if (!entry || typeof entry.id !== 'string') continue;
          keyStates[entry.id] = {
            id: entry.id,
            label: typeof entry.label === 'string' ? entry.label : entry.id,
            envName: typeof entry.envName === 'string' ? entry.envName : '',
            keys: Array.isArray(entry.keys)
              ? entry.keys.filter((key) => typeof key === 'string')
              : [],
            envFallback:
              typeof entry.envFallback === 'string' ? entry.envFallback : null,
            count:
              typeof entry.count === 'number'
                ? entry.count
                : Array.isArray(entry.keys)
                  ? entry.keys.length
                  : 0,
          };
        }
      }

      // GET /api/admin/prices lỗi không chặn trang — chỉ mất nhãn giá.
      const pricesJson = pricesRes && pricesRes.ok
        ? ((await pricesRes.json().catch(() => null)) as { prices?: unknown } | null)
        : null;

      setData({
        configs: json.configs ?? [],
        capabilities: json.capabilities ?? [],
        catalog: json.catalog ?? EMPTY_CATALOG,
        keyStates,
        priceIndex: buildPriceIndex(pricesJson?.prices),
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
        fallbacks: [],
        updatedAt: null,
      }
    : null;

  return (
    <div className="space-y-5">
      <BudgetsSection />

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
          keyStates={data.keyStates}
          priceIndex={data.priceIndex}
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
            fallbacks: toFallbackRows(row.config?.fallbacks),
            updatedAt: row.updated_at,
          }}
          catalog={data.catalog}
          keyStates={data.keyStates}
          priceIndex={data.priceIndex}
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
                keyStates={data.keyStates}
                priceIndex={data.priceIndex}
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
