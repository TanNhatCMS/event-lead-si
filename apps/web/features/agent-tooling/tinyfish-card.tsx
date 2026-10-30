'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Trash2 } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@kit/ui/alert';
import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';

interface TinyFishWallet {
  availableBalance: string;
  currency: string;
  asOf: string | null;
  autoReload: string | null;
}

interface TinyFishState {
  configured: boolean;
  error: string | null;
  wallet: TinyFishWallet | null;
  keyMasked: string | null;
}

/**
 * Thẻ quản lý TinyFish: API key lưu DB (write-only — UI chỉ nhận bản masked),
 * webhook URL để cấu hình callback phía TinyFish, số dư ví realtime.
 */
export function TinyFishCard() {
  const [state, setState] = useState<TinyFishState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [webhookOrigin, setWebhookOrigin] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agent/tinyfish');
      const json = (await res.json().catch(() => null)) as TinyFishState | null;
      if (res.ok && json) setState(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setWebhookOrigin(window.location.origin);
  }, [load]);

  async function saveKey() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/agent/tinyfish', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyInput.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ kind: 'error', text: json?.message ?? 'Không lưu được key.' });
        return;
      }
      setNotice({ kind: 'ok', text: 'Đã lưu API key (chỉ lưu ở server, không hiển thị lại).' });
      setKeyInput('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    if (!window.confirm('Gỡ API key TinyFish đã lưu? Backend search/fetch sẽ quay về dùng env (nếu có).')) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/agent/tinyfish', { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setNotice({ kind: 'error', text: json?.message ?? 'Không gỡ được key.' });
        return;
      }
      setNotice({ kind: 'ok', text: 'Đã gỡ API key.' });
      await load();
    } finally {
      setSaving(false);
    }
  }

  const webhookUrl = `${webhookOrigin}/api/agent/tinyfish/webhook`;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" />
              TinyFish
            </CardTitle>
            <CardDescription className="mt-1">
              Nguồn Search + Fetch web miễn phí cho agent. API key lưu trong DB
              (write-only) — không dùng biến môi trường.
            </CardDescription>
          </div>
          <Badge variant={state?.configured ? 'default' : 'secondary'}>
            {state?.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Đang tải trạng thái…
          </p>
        ) : (
          <>
            {state?.error && (
              <Alert variant="destructive">
                <AlertTitle>Key có thể không hợp lệ</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            {notice && (
              <Notice kind={notice.kind} text={notice.text} />
            )}

            {state?.configured && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-muted px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">Key đã lưu</p>
                  <p className="mt-0.5 font-mono text-sm">{state.keyMasked ?? '—'}</p>
                </div>
                <div className="rounded-xl bg-muted px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">Ví TinyFish</p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {state.wallet
                      ? `${state.wallet.availableBalance} ${state.wallet.currency}`
                      : '—'}
                  </p>
                  {state.wallet?.autoReload && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tự động nạp: {state.wallet.autoReload}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tinyfish-key">
                {state?.configured ? 'Đổi API key' : 'API key'}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="tinyfish-key"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-tinyfish-…"
                  type="password"
                  autoComplete="off"
                />
                <Button
                  onClick={() => void saveKey()}
                  disabled={saving || !keyInput.trim()}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Lưu
                </Button>
                {state?.configured && (
                  <Button variant="outline" onClick={() => void removeKey()} disabled={saving}>
                    <Trash2 className="size-4" />
                    Gỡ
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Lấy key tại agent.tinyfish.ai/api-keys. Key không hiển thị lại
                sau khi lưu.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tinyfish-webhook">Webhook URL (TinyFish gọi về)</Label>
              <div className="flex gap-2">
                <Input
                  id="tinyfish-webhook"
                  value={webhookUrl}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy webhook URL"
                  onClick={() => void navigator.clipboard.writeText(webhookUrl)}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Truyền URL này vào `webhook_url` khi tạo run-async. Callback được
                verify bằng cách gọi lại `GET /v1/runs/&#123;run_id&#125;` với key
                đã lưu — payload không verify được sẽ không được lưu.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Notice(props: { kind: 'ok' | 'error'; text: string }) {
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
