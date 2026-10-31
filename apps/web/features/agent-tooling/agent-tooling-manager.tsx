'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Switch } from '@kit/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kit/ui/tabs';
import { Textarea } from '@kit/ui/textarea';

// ---------------------------------------------------------------------------
// Kiểu dữ liệu dùng chung
// ---------------------------------------------------------------------------

interface McpServerRow {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

interface SkillRow {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

interface BuiltInTool {
  name: string;
  description: string;
  category: string;
  riskLevel: string;
}

const HOOK_LABELS: Record<string, { label: string; description: string }> = {
  audit_tool_calls: {
    label: 'Ghi audit log mỗi lần agent gọi tool',
    description:
      'Mỗi tool call của agent (kể cả tool MCP) được ghi vào Nhật ký — xem ở tab Trace/Hành động.',
  },
  egress_guard: {
    label: 'Egress guard — chặn truy cập nội bộ (luôn bật)',
    description:
      'Tool web không được gọi tới host nội bộ/private IP. Hook này nằm cứng vì lý do bảo mật.',
  },
};

function Notice(props: { kind: 'ok' | 'error'; text: string | null }) {
  if (!props.text) return null;
  return props.kind === 'ok' ? (
    <Alert>
      <AlertTitle>Thành công</AlertTitle>
      <AlertDescription>{props.text}</AlertDescription>
    </Alert>
  ) : (
    <Alert variant="destructive">
      <AlertTitle>Lỗi</AlertTitle>
      <AlertDescription>{props.text}</AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// EventLead MCP Server — key tự host (chỉ đọc danh bạ qua /api/mcp/v1)
// ---------------------------------------------------------------------------

interface McpKeyStatus {
  configured: boolean;
  masked: string | null;
}

/**
 * Card bật EventLead MCP Server: sinh/thu hồi API key dùng để gọi
 * POST /api/mcp/v1 (tools: lookup_contact, list_recent_contacts,
 * count_contacts — CHỈ ĐỌC). Key gốc chỉ hiển thị đúng một lần sau khi tạo.
 */
function EventLeadMcpCard() {
  const [status, setStatus] = useState<McpKeyStatus | null>(null);
  const [busy, setBusy] = useState<'generate' | 'revoke' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [endpoint, setEndpoint] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/v1/key');
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setStatus({ configured: Boolean(json?.configured), masked: json?.masked ?? null });
      }
    } catch {
      // bỏ qua — hiển thị như chưa cấu hình.
    }
  }, []);

  useEffect(() => {
    setEndpoint(window.location.origin + '/api/mcp/v1');
    void load();
  }, [load]);

  async function generate() {
    setBusy('generate');
    setNotice(null);
    setGeneratedKey(null);
    try {
      const res = await fetch('/api/mcp/v1/key', { method: 'PUT' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ kind: 'error', text: json?.message ?? 'Không tạo được key.' });
        return;
      }
      setGeneratedKey(json?.key ?? null);
      setNotice({
        kind: 'ok',
        text: 'Đã tạo key mới. Key gốc chỉ hiển thị MỘT lần duy nhất bên dưới — copy ngay.',
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (!window.confirm('Thu hồi API key của EventLead MCP Server? Client đang dùng key này sẽ bị từ chối (401).')) {
      return;
    }
    setBusy('revoke');
    setNotice(null);
    try {
      const res = await fetch('/api/mcp/v1/key', { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ kind: 'error', text: json?.message ?? 'Không thu hồi được key.' });
        return;
      }
      setGeneratedKey(null);
      setNotice({ kind: 'ok', text: 'Đã thu hồi key.' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function copyKey() {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard bị chặn — người dùng vẫn copy tay được.
    }
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Plug className="size-4" />
            EventLead MCP Server (tự host)
            {status?.configured ? (
              <Badge variant="secondary">Đang bật — {status.masked}</Badge>
            ) : (
              <Badge variant="outline">Chưa có key</Badge>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cho phép client MCP bên ngoài (Claude, Cursor…) đọc danh bạ của bạn
            qua 3 tool chỉ đọc: <code className="font-mono">lookup_contact</code>,{' '}
            <code className="font-mono">list_recent_contacts</code>,{' '}
            <code className="font-mono">count_contacts</code>. Không có tool ghi
            dữ liệu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() => void generate()}
          >
            {busy === 'generate' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {status?.configured ? 'Tạo key mới' : 'Bật MCP Server (tạo key)'}
          </Button>
          {status?.configured && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void revoke()}
            >
              {busy === 'revoke' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Thu hồi
            </Button>
          )}
        </div>
      </div>

      {status?.configured && (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all">
          Endpoint: {endpoint}
          <br />
          Header: Authorization: Bearer &lt;key&gt;
        </p>
      )}

      {generatedKey && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-700">
            Key của bạn (chỉ hiển thị lần này — copy ngay):
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 font-mono text-xs break-all">{generatedKey}</code>
            <Button size="sm" variant="outline" onClick={() => void copyKey()}>
              {copied ? 'Đã copy' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {notice && <Notice kind={notice.kind} text={notice.text} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1 — MCP Tools
// ---------------------------------------------------------------------------

function McpServersTab() {
  const [servers, setServers] = useState<McpServerRow[] | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', url: '', headers: '' });
  const [testResult, setTestResult] = useState<
    { ok: boolean; text: string } | null
  >(null);

  const load = useCallback(async () => {
    setBusy('load');
    try {
      const res = await fetch('/api/agent/mcp-servers');
      const json = await res.json().catch(() => null);
      if (res.ok) setServers(json?.servers ?? []);
      else setNotice({ kind: 'error', text: json?.message ?? 'Không tải được danh sách.' });
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addServer() {
    let headers: Record<string, string> = {};
    if (form.headers.trim()) {
      try {
        headers = JSON.parse(form.headers) as Record<string, string>;
      } catch {
        setNotice({ kind: 'error', text: 'Headers JSON không hợp lệ.' });
        return;
      }
    }
    setBusy('add');
    setNotice(null);
    try {
      const res = await fetch('/api/agent/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), url: form.url.trim(), headers }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ kind: 'error', text: json?.message ?? 'Không thêm được server.' });
        return;
      }
      setNotice({ kind: 'ok', text: `Đã thêm server "${form.name.trim()}".` });
      setForm({ name: '', url: '', headers: '' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function testServer(url: string, headers?: Record<string, string>) {
    setBusy(`test:${url}`);
    setTestResult(null);
    try {
      const res = await fetch('/api/agent/mcp-servers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, headers }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setTestResult({
          ok: true,
          text: `Kết nối OK — ${json.tools.length} tool: ${json.tools.join(', ') || '(trống)'}`,
        });
      } else {
        setTestResult({ ok: false, text: json?.error ?? json?.message ?? 'Kết nối thất bại.' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function patchServer(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    try {
      await fetch('/api/agent/mcp-servers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function deleteServer(server: McpServerRow) {
    if (!window.confirm(`Xóa MCP server "${server.name}"?`)) return;
    setBusy(server.id);
    try {
      await fetch('/api/agent/mcp-servers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: server.id }),
      });
      setNotice({ kind: 'ok', text: `Đã xóa "${server.name}".` });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Notice kind={notice?.kind ?? 'ok'} text={notice?.text ?? null} />

      <EventLeadMcpCard />

      <div className="rounded-xl border p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Plug className="size-4" />
          Thêm MCP server (streamable-http / SSE)
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">Tên server</Label>
            <Input
              id="mcp-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="vd: docs-server"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-url">URL</Label>
            <Input
              id="mcp-url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://example.com/mcp"
              inputMode="url"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="mcp-headers">
              Headers <span className="font-normal">(JSON tùy chọn, write-only)</span>
            </Label>
            <Textarea
              id="mcp-headers"
              value={form.headers}
              onChange={(e) => setForm((f) => ({ ...f, headers: e.target.value }))}
              placeholder='{"Authorization": "Bearer ..."}'
              rows={2}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!form.url.trim() || busy !== null}
            onClick={() => void testServer(form.url.trim())}
          >
            {busy === `test:${form.url.trim()}` ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Kiểm tra kết nối
          </Button>
          <Button
            size="sm"
            disabled={!form.name.trim() || !form.url.trim() || busy !== null}
            onClick={() => void addServer()}
          >
            {busy === 'add' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Thêm server
          </Button>
        </div>
        {testResult && (
          <p
            className={`mt-2 flex items-start gap-1.5 text-xs ${
              testResult.ok ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-3.5 shrink-0" />
            )}
            {testResult.text}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {(servers ?? []).map((server) => (
          <div
            key={server.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                {server.name}
                {server.enabled ? (
                  <Badge variant="secondary">Đang dùng</Badge>
                ) : (
                  <Badge variant="outline">Tạm tắt</Badge>
                )}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">{server.url}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void testServer(server.url)}
              >
                Kiểm tra
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void deleteServer(server)}
              >
                <Trash2 className="size-4" />
                Xóa
              </Button>
              <Switch
                checked={server.enabled}
                onCheckedChange={(enabled) => void patchServer(server.id, { enabled })}
                disabled={busy !== null}
                aria-label={`Bật/tắt ${server.name}`}
              />
            </div>
          </div>
        ))}
        {servers !== null && servers.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Chưa có MCP server nào. Tool từ server được hợp nhất vào agent khi chạy tiếp theo.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Skills
// ---------------------------------------------------------------------------

function SkillsTab() {
  const [skills, setSkills] = useState<SkillRow[] | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', content: '' });

  const load = useCallback(async () => {
    setBusy('load');
    try {
      const res = await fetch('/api/agent/skills');
      const json = await res.json().catch(() => null);
      if (res.ok) setSkills(json?.skills ?? []);
      else setNotice({ kind: 'error', text: json?.message ?? 'Không tải được skills.' });
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSkill() {
    setBusy('add');
    setNotice(null);
    try {
      const res = await fetch('/api/agent/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ kind: 'error', text: json?.message ?? 'Không thêm được skill.' });
        return;
      }
      setNotice({ kind: 'ok', text: `Đã thêm skill "${form.name.trim()}".` });
      setForm({ name: '', description: '', content: '' });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function patchSkill(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    try {
      await fetch('/api/agent/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function deleteSkill(skill: SkillRow) {
    if (!window.confirm(`Xóa skill "${skill.name}"?`)) return;
    setBusy(skill.id);
    try {
      await fetch('/api/agent/skills', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id }),
      });
      setNotice({ kind: 'ok', text: `Đã xóa "${skill.name}".` });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Notice kind={notice?.kind ?? 'ok'} text={notice?.text ?? null} />

      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-medium">Thêm skill (markdown, nối vào system prompt agent)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="skill-name">Tên skill</Label>
            <Input
              id="skill-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="vd: xu-ly-so-dien-thoai"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="skill-desc">Mô tả ngắn</Label>
            <Input
              id="skill-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Khi nào agent nên dùng skill này"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="skill-content">Nội dung markdown</Label>
            <Textarea
              id="skill-content"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Hướng dẫn cho agent…"
              rows={5}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="mt-3"
          disabled={!form.name.trim() || !form.content.trim() || busy !== null}
          onClick={() => void addSkill()}
        >
          {busy === 'add' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Thêm skill
        </Button>
      </div>

      <div className="space-y-3">
        {(skills ?? []).map((skill) => (
          <div key={skill.id} className="rounded-xl border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {skill.name}
                  {skill.enabled ? (
                    <Badge variant="secondary">Đang dùng</Badge>
                  ) : (
                    <Badge variant="outline">Tạm tắt</Badge>
                  )}
                </p>
                {skill.description && (
                  <p className="text-xs text-muted-foreground">{skill.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void deleteSkill(skill)}
                >
                  <Trash2 className="size-4" />
                  Xóa
                </Button>
                <Switch
                  checked={skill.enabled}
                  onCheckedChange={(enabled) => void patchSkill(skill.id, { enabled })}
                  disabled={busy !== null}
                  aria-label={`Bật/tắt ${skill.name}`}
                />
              </div>
            </div>
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
              {skill.content}
            </pre>
          </div>
        ))}
        {skills !== null && skills.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Chưa có skill nào. Skill enabled được nối vào system prompt ở lần chạy agent tiếp theo.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Hooks + Tab 4 — Plugins (cùng đọc /api/agent/config)
// ---------------------------------------------------------------------------

interface ConfigPayload {
  hooks: Record<string, boolean>;
  plugins: Record<string, boolean>;
  builtInTools: BuiltInTool[];
}

function useAgentConfig() {
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/agent/config');
      const json = await res.json().catch(() => null);
      if (res.ok) setConfig(json);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(patch: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch('/api/agent/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ kind: 'error', text: json?.message ?? 'Không lưu được cấu hình.' });
        return;
      }
      setNotice({ kind: 'ok', text: 'Đã lưu — có hiệu lực ở lần chạy agent tiếp theo.' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return { config, notice, busy, patch, reload: load };
}

function HooksTab() {
  const { config, notice, busy, patch } = useAgentConfig();
  // Plugin "auto_enrich_on_scan" — hợp đồng GET/PATCH /api/agent/config
  // (plugins: Record<string, boolean>). Mặc định TẮT cho tới khi backend
  // trả về key này = true.
  const autoEnrich = config?.plugins?.auto_enrich_on_scan === true;

  return (
    <div className="space-y-4">
      <Notice kind={notice?.kind ?? 'ok'} text={notice?.text ?? null} />
      {Object.entries(HOOK_LABELS).map(([key, meta]) => {
        const locked = key === 'egress_guard';
        const enabled = locked ? true : (config?.hooks[key] ?? key === 'audit_tool_calls');
        return (
          <div
            key={key}
            className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
          >
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                {meta.label}
                {locked && <Badge variant="outline">Locked</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
            </div>
            <Switch
              checked={enabled}
              disabled={locked || busy}
              onCheckedChange={(value) => void patch({ hooks: { ...config?.hooks, [key]: value } })}
              aria-label={meta.label}
            />
          </div>
        );
      })}

      {/* Tự động hoá — plugin hành vi, hợp đồng PATCH merge theo key. */}
      <div className="pt-2">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tự động hoá
        </p>
        <div className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-primary" />
              Tự động làm giàu dữ liệu khi quét xong
            </p>
            <p className="text-xs text-muted-foreground">
              Contact mới sau khi xác nhận sẽ được AI bổ sung thông tin nền.
            </p>
          </div>
          <Switch
            checked={autoEnrich}
            disabled={busy || config === null}
            onCheckedChange={(value) =>
              void patch({
                plugins: { ...config?.plugins, auto_enrich_on_scan: value },
              })
            }
            aria-label="Tự động làm giàu dữ liệu khi quét xong"
          />
        </div>
      </div>
    </div>
  );
}

function PluginsTab() {
  const { config, notice, busy, patch, reload } = useAgentConfig();

  return (
    <div className="space-y-4">
      <Notice kind={notice?.kind ?? 'ok'} text={notice?.text ?? null} />
      <p className="text-xs text-muted-foreground">
        Plugins là các tool built-in của agent. Tắt một tool = agent không nhìn
        thấy nó ở lần chạy tiếp theo (mặc định tất cả đều bật).
        <Button variant="ghost" size="sm" className="ml-1 h-auto p-0 text-xs" onClick={() => void reload()}>
          <RefreshCw className="mr-1 size-3" />
          Làm mới
        </Button>
      </p>
      {(config?.builtInTools ?? []).map((tool) => {
        const enabled = config?.plugins[tool.name] !== false;
        return (
          <div
            key={tool.name}
            className="flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
          >
            <div>
              <p className="flex items-center gap-2 text-sm font-medium">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{tool.name}</code>
                <Badge variant="outline">{tool.category}</Badge>
                {tool.riskLevel !== 'low' && <Badge variant="secondary">{tool.riskLevel}</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">{tool.description}</p>
            </div>
            <Switch
              checked={enabled}
              disabled={busy}
              onCheckedChange={(value) =>
                void patch({ plugins: { ...config?.plugins, [tool.name]: value } })
              }
              aria-label={`Bật/tắt ${tool.name}`}
            />
          </div>
        );
      })}
      {config !== null && (config.builtInTools ?? []).length === 0 && (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Registry chưa đăng ký tool built-in nào.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager chính
// ---------------------------------------------------------------------------

/**
 * Quản lý năng lực agent: MCP Tools, Skills, Hooks, Plugins.
 * Cấu hình user-scoped — có hiệu lực cho agent loop (enrichment) ở lần chạy
 * tiếp theo. Trang admin, nhưng dữ liệu là của từng người dùng.
 */
export function AgentToolingManager() {
  return (
    <Tabs defaultValue="mcp" className="w-full">
      <TabsList>
        <TabsTrigger value="mcp">MCP Tools</TabsTrigger>
        <TabsTrigger value="skills">Skills</TabsTrigger>
        <TabsTrigger value="hooks">Hooks</TabsTrigger>
        <TabsTrigger value="plugins">Plugins</TabsTrigger>
      </TabsList>

      <TabsContent value="mcp" className="mt-4">
        <McpServersTab />
      </TabsContent>
      <TabsContent value="skills" className="mt-4">
        <SkillsTab />
      </TabsContent>
      <TabsContent value="hooks" className="mt-4">
        <HooksTab />
      </TabsContent>
      <TabsContent value="plugins" className="mt-4">
        <PluginsTab />
      </TabsContent>
    </Tabs>
  );
}
