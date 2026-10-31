'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitMerge, ShieldQuestionMark } from 'lucide-react';

import { Badge } from '@kit/ui/badge';
import { Button } from '@kit/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Spinner } from '@kit/ui/spinner';
import { toast } from '@kit/ui/sonner';
import { cn } from '@kit/ui/utils';

import {
  computeMergePlan,
  MERGE_REASON_LABELS,
  type MergeReason,
} from '~/lib/contacts/merge';

type Candidate = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  labels: string[] | null;
  company_name: string | null;
  reasons: MergeReason[];
};

/** Contact nguồn (mở dialog từ menu trong danh-bạ) — chỉ cần id + tên. */
export type MergeDialogSource = {
  id: string;
  full_name: string;
};

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Số điện thoại',
  address: 'Địa chỉ',
  job_title: 'Chức danh',
  labels: 'Nhãn',
};

/**
 * Dialog gộp liên hệ trùng: chọn liên hệ đích từ ứng viên (kèm lý do khớp),
 * xem trước các trường sẽ được điền từ hồ sơ nguồn, xác nhận rồi POST
 * /api/contacts/merge. Sau khi gộp thành công, `onMerged` để danh-bạ tải lại.
 */
export function MergeDialog({
  contact,
  onOpenChange,
  onMerged,
}: {
  contact: MergeDialogSource | null;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void;
}) {
  const open = contact !== null;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sourceFull, setSourceFull] = useState<{
    email: string | null;
    phone: string | null;
    address: string | null;
    job_title: string | null;
    labels: string[] | null;
  } | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async (sourceId: string) => {
    setLoading(true);
    setError(null);
    setTargetId(null);
    try {
      const [candRes, detailRes] = await Promise.all([
        fetch('/api/contacts/merge/candidates?contact_id=' + sourceId),
        fetch('/api/contacts/' + sourceId),
      ]);
      const candJson = await candRes.json().catch(() => ({}));
      if (!candRes.ok) {
        throw new Error(candJson.message ?? 'Không tải được ứng viên gộp.');
      }
      setCandidates(Array.isArray(candJson.candidates) ? candJson.candidates : []);
      // Chi tiết nguồn để xem trước diff trường (address/labels không có ở hàng danh-bạ).
      if (detailRes.ok) {
        const detailJson = await detailRes.json().catch(() => ({}));
        const detail = detailJson?.contact ?? null;
        if (detail) {
          setSourceFull({
            email: detail.email ?? null,
            phone: detail.phone ?? null,
            address: detail.address ?? null,
            job_title: detail.job_title ?? null,
            labels: Array.isArray(detail.labels) ? detail.labels : null,
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được ứng viên gộp.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contact) {
      void loadCandidates(contact.id);
    } else {
      setCandidates([]);
      setSourceFull(null);
      setTargetId(null);
      setError(null);
    }
  }, [contact, loadCandidates]);

  // Xem trước: hồ sơ đích sẽ nhận những gì từ hồ sơ nguồn (thuần — lib/contacts/merge).
  const plan = useMemo(() => {
    if (!contact || !targetId || !sourceFull) return null;
    const target = candidates.find((c) => c.id === targetId);
    if (!target) return null;
    return computeMergePlan(
      {
        id: target.id,
        full_name: target.full_name,
        job_title: target.job_title,
        email: target.email,
        phone: target.phone,
        address: target.address,
        labels: target.labels ?? [],
      },
      {
        id: contact.id,
        full_name: contact.full_name,
        job_title: sourceFull.job_title,
        email: sourceFull.email,
        phone: sourceFull.phone,
        address: sourceFull.address,
        labels: sourceFull.labels ?? [],
      },
    );
  }, [contact, targetId, sourceFull, candidates]);

  const fieldsTakenLabels = plan
    ? (plan.fieldsTaken as string[]).map((f) => FIELD_LABELS[f] ?? f)
    : [];

  async function handleMerge() {
    if (!contact || !targetId) return;
    setMerging(true);
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: contact.id, target_id: targetId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message ?? 'Gộp liên hệ thất bại.');
      }
      toast.success(
        'Đã gộp liên hệ. Hồ sơ nguồn được lưu trữ — có thể khôi phục trong tab Đã lưu trữ.',
      );
      onOpenChange(false);
      onMerged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gộp liên hệ thất bại.');
    } finally {
      setMerging(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4" /> Gộp liên hệ trùng
          </DialogTitle>
          <DialogDescription>
            Chọn hồ sơ giữ lại — dữ liệu của{' '}
            <span className="font-medium text-foreground">
              {contact?.full_name ?? 'liên hệ này'}
            </span>{' '}
            sẽ được chuyển sang và hồ sơ nguồn sẽ được lưu trữ (không xóa vĩnh viễn).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : candidates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Không tìm thấy liên hệ nào trùng (cùng công ty, trùng email/SĐT hoặc tên
            giống nhau).
          </p>
        ) : (
          <div className="space-y-3">
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setTargetId(c.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    targetId === c.id
                      ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30'
                      : 'hover:border-primary/40',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.job_title, c.company_name].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {c.reasons.map((r) => (
                        <Badge key={r} variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {MERGE_REASON_LABELS[r] ?? r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {[c.email, c.phone].filter(Boolean).join(' · ') || '—'}
                  </p>
                </button>
              ))}
            </div>

            {plan && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Xem trước khi gộp
                </p>
                {fieldsTakenLabels.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Hồ sơ đích đã đầy đủ — chỉ chuyển ghi chú, follow-up và danh thiếp.
                  </p>
                ) : (
                  <p className="text-xs">
                    Hồ sơ đích sẽ được điền thêm:{' '}
                    <span className="font-medium">{fieldsTakenLabels.join(', ')}</span>{' '}
                    từ hồ sơ nguồn.
                  </p>
                )}
                <p className="mt-1.5 inline-flex items-start gap-1 text-[11px] text-muted-foreground">
                  <ShieldQuestionMark className="mt-0.5 h-3 w-3 shrink-0" />
                  Ghi chú, follow-up, danh thiếp và nhãn được chuyển/hợp trọn vẹn;
                  hồ sơ nguồn chỉ bị lưu trữ, có thể khôi phục.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            disabled={!targetId || merging || loading}
            onClick={() => void handleMerge()}
          >
            {merging ? 'Đang gộp...' : 'Gộp liên hệ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
