'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Building2,
  Pencil,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

import { NotesPanel } from './notes-panel';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@kit/ui/alert-dialog';
import { Badge } from '@kit/ui/badge';
import { Button, buttonVariants } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Separator } from '@kit/ui/separator';
import { Spinner } from '@kit/ui/spinner';
import { Textarea } from '@kit/ui/textarea';
import { cn } from '@kit/ui/utils';

type Company = {
  id: string;
  display_name: string;
  website: string | null;
  industry: string | null;
  share_token: string;
};

type Contact = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  preferred_language: string | null;
  relationship_stage: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  company_id: string | null;
  companies: Company | null;
};

type Evidence = {
  id: string;
  field_name: string;
  value_snapshot: string | null;
  source_type: string;
  verification_state: string;
  created_at: string;
};

type Note = {
  id: string;
  body: string;
  note_type: string;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
};

const STAGES = [
  { id: 'new', label: 'Mới' },
  { id: 'contacted', label: 'Đã liên hệ' },
  { id: 'meeting', label: 'Đã gặp' },
  { id: 'negotiating', label: 'Đang đàm phán' },
  { id: 'customer', label: 'Khách hàng' },
  { id: 'lost', label: 'Không tiếp tục' },
];

const SOURCE_LABELS: Record<string, string> = {
  card_ocr: 'Quét danh thiếp',
  user: 'Người dùng',
  public_source: 'Nguồn công khai',
  ai_inference: 'AI suy luận',
  integration: 'Tích hợp',
};

const VERIFY_LABELS: Record<string, string> = {
  unreviewed: 'Chưa xem lại',
  user_confirmed: 'Đã xác nhận',
  source_verified: 'Nguồn đã xác minh',
  inferred: 'Suy luận',
  uncertain: 'Chưa chắc chắn',
  unavailable: 'Không có',
};

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Họ và tên',
  job_title: 'Chức danh',
  email: 'Email',
  phone: 'SĐT',
  address: 'Địa chỉ',
  preferred_language: 'Ngôn ngữ',
  relationship_stage: 'Giai đoạn',
  company_id: 'Công ty',
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Trang chi tiết liên hệ: xem, sửa từng trường, xem nguồn gốc dữ liệu
 * (evidence), ghi chú cuộc gặp, lưu trữ / xóa.
 */
export function ContactDetail({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    job_title: '',
    email: '',
    phone: '',
    address: '',
    relationship_stage: 'new',
    company_id: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, companiesRes] = await Promise.all([
        fetch(`/api/contacts/${contactId}`),
        fetch('/api/companies'),
      ]);
      const detail = await detailRes.json();
      if (!detailRes.ok) throw new Error(detail.message ?? 'Không tải được liên hệ.');
      setContact(detail.contact);
      setEvidence(detail.evidence);
      setNotes(detail.notes);
      setForm({
        full_name: detail.contact.full_name ?? '',
        job_title: detail.contact.job_title ?? '',
        email: detail.contact.email ?? '',
        phone: detail.contact.phone ?? '',
        address: detail.contact.address ?? '',
        relationship_stage: detail.contact.relationship_stage ?? 'new',
        company_id: detail.contact.company_id ?? '',
      });
      if (companiesRes.ok) {
        const cj = await companiesRes.json();
        setCompanies(cj.companies ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được liên hệ.');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    if (!form.full_name.trim()) {
      setFormError('Họ và tên không được để trống.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          job_title: form.job_title.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          relationship_stage: form.relationship_stage || null,
          company_id: form.company_id || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Lưu thất bại.');
      setEditing(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(next: boolean) {
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: next }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError(next ? 'Lưu trữ thất bại.' : 'Khôi phục thất bại.');
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.push('/home/danh-ba');
    } catch {
      setError('Xóa liên hệ thất bại.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error || !contact) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-destructive">
          {error ?? 'Không tìm thấy liên hệ.'}
        </CardContent>
      </Card>
    );
  }

  const archived = !!contact.archived_at;

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Thông tin chính */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">{contact.full_name}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {[contact.job_title, contact.companies?.display_name].filter(Boolean).join(' · ') ||
                'Chưa có chức danh'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {archived && <Badge variant="secondary">Đã lưu trữ</Badge>}
            {editing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  <X className="mr-1 h-4 w-4" /> Hủy
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 h-4 w-4" /> Sửa
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}
          {editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Họ và tên *</Label>
                <Input id="full_name" value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job_title">Chức danh</Label>
                <Input id="job_title" value={form.job_title} onChange={(e) => set('job_title')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">SĐT</Label>
                <Input id="phone" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="address">Địa chỉ</Label>
                <Textarea id="address" rows={2} value={form.address} onChange={(e) => set('address')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="company">Công ty</Label>
                <select
                  id="company"
                  value={form.company_id}
                  onChange={(e) => set('company_id')(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  <option value="">— Chưa gán —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stage">Giai đoạn quan hệ</Label>
                <select
                  id="stage"
                  value={form.relationship_stage}
                  onChange={(e) => set('relationship_stage')(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ['Email', contact.email],
                ['SĐT', contact.phone],
                ['Địa chỉ', contact.address],
                ['Ngôn ngữ', contact.preferred_language],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                  <dd className="mt-1 text-sm">{value || '—'}</dd>
                </div>
              ))}
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Giai đoạn</dt>
                <dd className="mt-1 text-sm">
                  {STAGES.find((s) => s.id === contact.relationship_stage)?.label ??
                    contact.relationship_stage ??
                    '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Công ty</dt>
                <dd className="mt-1 flex items-center gap-1.5 text-sm">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {contact.companies?.display_name ?? '—'}
                </dd>
              </div>
            </dl>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">
            Tạo {formatDateTime(contact.created_at)} · Cập nhật {formatDateTime(contact.updated_at)}
          </p>
        </CardContent>
      </Card>

      {/* Nguồn gốc dữ liệu */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> Nguồn gốc từng trường
          </CardTitle>
        </CardHeader>
        <CardContent>
          {evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có bằng chứng nguồn gốc.</p>
          ) : (
            <ul className="divide-y divide-border">
              {evidence.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{FIELD_LABELS[e.field_name] ?? e.field_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {e.value_snapshot ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="outline">{SOURCE_LABELS[e.source_type] ?? e.source_type}</Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {VERIFY_LABELS[e.verification_state] ?? e.verification_state}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Ghi chú & việc cần làm */}
      <NotesPanel
        contactId={contact.id}
        contactName={contact.full_name}
        notes={notes}
        onChanged={load}
      />

      <Separator />

      {/* Hành động nguy hiểm */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => handleArchive(!archived)}>
          {archived ? (
            <>
              <ArchiveRestore className="mr-1.5 h-4 w-4" /> Khôi phục
            </>
          ) : (
            <>
              <Archive className="mr-1.5 h-4 w-4" /> Lưu trữ
            </>
          )}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger
            className={cn(buttonVariants({ variant: 'destructive', size: 'sm' }))}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Xóa vĩnh viễn
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xóa liên hệ này?</AlertDialogTitle>
              <AlertDialogDescription>
                {contact.full_name} và toàn bộ bằng chứng, ghi chú liên quan sẽ bị xóa
                vĩnh viễn. Hành động này không thể hoàn tác.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Hủy</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Xóa vĩnh viễn</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
