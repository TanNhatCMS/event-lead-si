'use client';

import { useEffect, useState } from 'react';
import { DatabaseBackup, Download, Trash2 } from 'lucide-react';

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
import { Spinner } from '@kit/ui/spinner';
import { toast } from '@kit/ui/sonner';

/** Nhánh `settings` của agent_config — hợp đồng API frontend/backend. */
type AgentSettings = {
  labels?: string[];
  stages?: Array<{ id: string; label: string }>;
  retention_days?: number | null;
};

/**
 * Card "Chính sách dữ liệu" (FR-024):
 * - Đặt số ngày giữ liên hệ đã lưu trữ (archived) — để trống là không giới hạn.
 *   Lưu qua PATCH /api/agent/config { settings: { retention_days } }.
 * - "Dọn dẹp ngay": POST /api/contacts/cleanup { dry_run: true } để ước lượng
 *   số liên hệ sẽ xóa, người dùng xác nhận rồi mới chạy dry_run: false thật.
 */
export function DataPolicyCard() {
  const [retentionInput, setRetentionInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  // Kết quả dry-run đang chờ xác nhận (null = chưa chạy dry-run).
  const [pending, setPending] = useState<{
    wouldDelete: number;
    olderThan: number | null;
  } | null>(null);
  const [cleanError, setCleanError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);
  // Tải bản sao dữ liệu (GET /api/backup → JSON download).
  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  // Settings hiện có — gửi kèm khi PATCH để không mất labels/stages.
  const [currentSettings, setCurrentSettings] = useState<AgentSettings | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/agent/config');
        if (!res.ok) return;
        const json = await res.json();
        const s = json?.settings;
        if (s) {
          setCurrentSettings(s);
          if (typeof s.retention_days === 'number') {
            setRetentionInput(String(s.retention_days));
          }
        }
      } catch {
        // im lặng — card vẫn hiển thị, lưu sẽ gửi giá trị mới
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function parseRetention(): number | null | 'invalid' {
    const raw = retentionInput.trim();
    if (!raw) return null;
    const n = Number(raw);
    // Giới hạn khớp backend (lib/contacts/settings.ts): 1..3650 ngày.
    if (!Number.isInteger(n) || n < 1 || n > 3650) return 'invalid';
    return n;
  }

  async function handleSave() {
    const parsed = parseRetention();
    if (parsed === 'invalid') {
      toast.error(
        'Số ngày lưu trữ phải là số nguyên từ 1 đến 3650. Để trống nếu không giới hạn.',
      );
      return;
    }
    setSaving(true);
    try {
      const settings: AgentSettings = {
        ...(currentSettings ?? {}),
        retention_days: parsed,
      };
      const res = await fetch('/api/agent/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? 'Lưu chính sách thất bại.');
      }
      setCurrentSettings(settings);
      toast.success('Đã lưu chính sách lưu trữ.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lưu chính sách thất bại.');
    } finally {
      setSaving(false);
    }
  }

  /** Bước 1: ước lượng số liên hệ sẽ bị xóa (dry-run, không xóa thật). */
  async function handleDryRun() {
    setCleaning(true);
    setCleanError(null);
    setDeletedCount(null);
    try {
      const res = await fetch('/api/contacts/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 400 && json?.code === 'no_policy') {
        setCleanError(
          'Chưa cấu hình số ngày lưu trữ. Hãy nhập và lưu trước khi dọn dẹp.',
        );
        return;
      }
      if (!res.ok) {
        throw new Error(json.message ?? 'Không ước lượng được số liên hệ sẽ xóa.');
      }
      setPending({
        wouldDelete: json.would_delete ?? 0,
        olderThan:
          typeof json.older_than === 'number' ? json.older_than : null,
      });
    } catch (e) {
      setCleanError(
        e instanceof Error ? e.message : 'Không ước lượng được số liên hệ sẽ xóa.',
      );
    } finally {
      setCleaning(false);
    }
  }

  /** Bước 2: xác nhận — xóa thật. */
  async function handleConfirmCleanup() {
    if (!pending) return;
    setCleaning(true);
    setCleanError(null);
    try {
      const res = await fetch('/api/contacts/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? 'Dọn dẹp thất bại.');
      }
      setDeletedCount(json.deleted ?? 0);
      setPending(null);
    } catch (e) {
      setCleanError(e instanceof Error ? e.message : 'Dọn dẹp thất bại.');
    } finally {
      setCleaning(false);
    }
  }

  /**
   * Tải toàn bộ dữ liệu user dạng JSON (GET /api/backup) — file
   * eventlead-backup-YYYYMMDD.json, mỗi bảng tối đa 5000 dòng.
   */
  async function handleBackupDownload() {
    setBackingUp(true);
    setBackupError(null);
    try {
      const res = await fetch('/api/backup');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? 'Tải dữ liệu thất bại.');
      }
      const blob = new Blob([JSON.stringify(json, null, 2)], {
        type: 'application/json',
      });
      const now = new Date();
      const stamp =
        String(now.getFullYear()) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'eventlead-backup-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Đã tải bản sao dữ liệu.');
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : 'Tải dữ liệu thất bại.');
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseBackup className="h-4 w-4" /> Chính sách dữ liệu
        </CardTitle>
        <CardDescription>
          Giới hạn thời gian lưu giữ liên hệ đã lưu trữ (archived) và dọn dẹp
          thủ công.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="retention-days">Số ngày giữ liên hệ đã lưu trữ</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id="retention-days"
                  type="number"
                  min={1}
                  className="w-36"
                  placeholder="Không giới hạn"
                  value={retentionInput}
                  onChange={(e) => setRetentionInput(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Để trống nếu không giới hạn. Liên hệ đã lưu trữ (archived) quá hạn
                sẽ bị xóa vĩnh viễn cùng dữ liệu liên quan.
              </p>
            </div>

            <div className="space-y-2 border-t pt-3">
              {pending === null ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={backingUp}
                    onClick={() => void handleBackupDownload()}
                    title="Tải toàn bộ dữ liệu của bạn dưới dạng JSON"
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    {backingUp ? 'Đang tải...' : 'Tải dữ liệu (JSON)'}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cleaning}
                    onClick={() => void handleDryRun()}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    {cleaning ? 'Đang kiểm tra...' : 'Dọn dẹp ngay'}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
                  <p className="text-sm">
                    Sẽ xóa{' '}
                    <span className="font-semibold">{pending.wouldDelete}</span>{' '}
                    liên hệ
                    {pending.olderThan !== null && (
                      <>
                        {' '}
                        đã lưu trữ quá{' '}
                        <span className="font-semibold">{pending.olderThan}</span>{' '}
                        ngày
                      </>
                    )}
                    .
                  </p>
                  <div className="ml-auto flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cleaning}
                      onClick={() => setPending(null)}
                    >
                      Hủy
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={cleaning}
                      onClick={() => void handleConfirmCleanup()}
                    >
                      {cleaning ? 'Đang xóa...' : 'Xác nhận xóa'}
                    </Button>
                  </div>
                </div>
              )}
              {cleanError && (
                <p className="text-sm text-destructive">{cleanError}</p>
              )}
              {backupError && (
                <p className="text-sm text-destructive">{backupError}</p>
              )}
              {deletedCount !== null && (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Đã xóa <span className="font-semibold">{deletedCount}</span>{' '}
                  liên hệ.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
