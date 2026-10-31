'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Info,
  Pencil,
  QrCode,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

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
import { Alert, AlertDescription } from '@kit/ui/alert';
import { alertExtras } from '@kit/ui/alert-extras';
import { Badge } from '@kit/ui/badge';
import { Button, buttonVariants } from '@kit/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@kit/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kit/ui/dialog';
import { Input } from '@kit/ui/input';
import { Label } from '@kit/ui/label';
import { Spinner } from '@kit/ui/spinner';
import { Textarea } from '@kit/ui/textarea';
import { cn } from '@kit/ui/utils';

import { qrDataUrl } from '~/lib/qr';

type Company = {
  id: string;
  display_name: string;
  legal_name: string | null;
  country_code: string | null;
  website: string | null;
  industry: string | null;
  market_summary: string | null;
  employee_size_range: string | null;
  founded_year: number | null;
  products_summary: string | null;
  tax_or_registration_id: string | null;
  profile_state: string;
  share_token: string | null;
  contacts_count: number;
  created_at: string;
  updated_at: string;
};

type CompanyForm = {
  legal_name: string;
  country_code: string;
  website: string;
  industry: string;
  market_summary: string;
  employee_size_range: string;
  founded_year: string;
  products_summary: string;
  tax_or_registration_id: string;
};

const PROFILE_LABELS: Record<string, string> = {
  user_provided: 'Người dùng cung cấp',
  partially_verified: 'Đã xác minh một phần (AI)',
  verified: 'Đã xác minh',
  needs_review: 'Cần xem lại',
};

function toForm(c: Company): CompanyForm {
  return {
    legal_name: c.legal_name ?? '',
    country_code: c.country_code ?? '',
    website: c.website ?? '',
    industry: c.industry ?? '',
    market_summary: c.market_summary ?? '',
    employee_size_range: c.employee_size_range ?? '',
    founded_year: c.founded_year != null ? String(c.founded_year) : '',
    products_summary: c.products_summary ?? '',
    tax_or_registration_id: c.tax_or_registration_id ?? '',
  };
}

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
 * Trang chi tiết công ty: xem / sửa các trường hồ sơ (FR-008), xác minh
 * thông tin và link trang chia sẻ công khai.
 */
export function CompanyDetail({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>({
    legal_name: '',
    country_code: '',
    website: '',
    industry: '',
    market_summary: '',
    employee_size_range: '',
    founded_year: '',
    products_summary: '',
    tax_or_registration_id: '',
  });

  // QR chia sẻ: encode CHỈ link công khai /chia-se/<share_token>.
  const [qrOpen, setQrOpen] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [qrCopied, setQrCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // Load lúc mount (loading=true, error=null sẵn từ useState ban đầu);
  // pattern async IIFE giống companies-list để tránh cascading render trong effect.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/companies/${companyId}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? 'Không tìm thấy công ty.'
              : (json.message ?? 'Không tải được thông tin công ty.'),
          );
        }
        setCompany(json.company);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không tải được thông tin công ty.');
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const set = (key: keyof CompanyForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const year = Number(form.founded_year);
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_name: form.legal_name.trim() || null,
          country_code: form.country_code.trim().toUpperCase() || null,
          website: form.website.trim() || null,
          industry: form.industry.trim() || null,
          market_summary: form.market_summary.trim() || null,
          employee_size_range: form.employee_size_range.trim() || null,
          founded_year:
            form.founded_year.trim() && Number.isFinite(year) ? year : null,
          products_summary: form.products_summary.trim() || null,
          tax_or_registration_id: form.tax_or_registration_id.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Lưu thất bại.');
      setCompany(json.company);
      setEditing(false);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Lưu thất bại.');
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? 'Xác minh thất bại.');
      setCompany(json.company);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Xác minh thất bại.');
    } finally {
      setVerifying(false);
    }
  }

  /** Mở dialog QR: absolute URL từ origin hiện tại rồi vẽ QR (data-URL PNG). */
  async function openQr() {
    if (!company?.share_token) return;
    setQrOpen(true);
    setQrError(null);
    setQrCopied(false);
    const absolute =
      window.location.origin + '/chia-se/' + company.share_token;
    setQrUrl(absolute);
    setQrBusy(true);
    try {
      const dataUrl = await qrDataUrl(absolute);
      setQrData(dataUrl);
    } catch {
      setQrError('Không tạo được mã QR. Vui lòng thử lại.');
    } finally {
      setQrBusy(false);
    }
  }

  async function copyQrUrl() {
    if (!qrUrl) return;
    try {
      await navigator.clipboard.writeText(qrUrl);
      setQrCopied(true);
      setTimeout(() => setQrCopied(false), 2000);
    } catch {
      setQrError('Không sao chép được — vui lòng copy thủ công từ ô bên dưới.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error || !company) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-destructive">
          {error ?? 'Không tìm thấy công ty.'}
        </CardContent>
      </Card>
    );
  }

  const verified = company.profile_state === 'verified';

  return (
    <div className="flex w-full flex-col gap-5">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
              <Building2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate">{company.display_name}</span>
              {company.profile_state && (
                <Badge variant="outline">
                  {PROFILE_LABELS[company.profile_state] ?? company.profile_state}
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {company.legal_name ?? 'Chưa có tên pháp lý'}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {company.contacts_count} liên hệ
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {company.share_token && (
              <>
                <Button size="sm" variant="ghost" onClick={() => void openQr()}>
                  <QrCode className="mr-1.5 h-4 w-4" /> QR chia sẻ
                </Button>
                <a
                  href={`/chia-se/${company.share_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" /> Trang chia sẻ
                </a>
              </>
            )}
            {editing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Đang lưu...' : 'Lưu'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setFormError(null);
                  }}
                >
                  <X className="mr-1 h-4 w-4" /> Hủy
                </Button>
              </>
            ) : (
              <>
                {!verified && (
                  <AlertDialog>
                    <AlertDialogTrigger
                      className={buttonVariants({ variant: 'outline', size: 'sm' })}
                      disabled={verifying}
                    >
                      <ShieldCheck className="mr-1.5 h-4 w-4" /> Đã xác minh thông tin
                      này
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Xác minh thông tin công ty?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Xác nhận rằng anh đã kiểm tra và các trường hồ sơ bên dưới
                          là chính xác. Trạng thái công ty sẽ chuyển thành
                          &ldquo;Đã xác minh&rdquo;.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Hủy</AlertDialogCancel>
                        <AlertDialogAction onClick={handleVerify}>
                          Xác minh
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm(toForm(company));
                    setEditing(true);
                  }}
                >
                  <Pencil className="mr-1 h-4 w-4" /> Sửa
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {company.profile_state === 'partially_verified' && (
            <Alert className={cn('mb-4', alertExtras.info)}>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Một số trường được AI bổ sung từ nguồn công khai — hãy xem lại và
                xác minh.
              </AlertDescription>
            </Alert>
          )}
          {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

          {editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="legal_name">Tên pháp lý</Label>
                <Input
                  id="legal_name"
                  value={form.legal_name}
                  onChange={(e) => set('legal_name')(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="country_code">Mã quốc gia (2 chữ)</Label>
                <Input
                  id="country_code"
                  maxLength={2}
                  placeholder="VD: VN"
                  value={form.country_code}
                  onChange={(e) => set('country_code')(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://"
                  value={form.website}
                  onChange={(e) => set('website')(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="industry">Ngành nghề</Label>
                <Input
                  id="industry"
                  value={form.industry}
                  onChange={(e) => set('industry')(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="employee_size_range">Quy mô nhân sự</Label>
                <Input
                  id="employee_size_range"
                  placeholder="VD: 50-200"
                  value={form.employee_size_range}
                  onChange={(e) => set('employee_size_range')(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="founded_year">Năm thành lập</Label>
                <Input
                  id="founded_year"
                  type="number"
                  value={form.founded_year}
                  onChange={(e) => set('founded_year')(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tax_or_registration_id">
                  Mã số thuế / Đăng ký kinh doanh
                </Label>
                <Input
                  id="tax_or_registration_id"
                  value={form.tax_or_registration_id}
                  onChange={(e) => set('tax_or_registration_id')(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="market_summary">Tóm tắt thị trường</Label>
                <Textarea
                  id="market_summary"
                  rows={3}
                  value={form.market_summary}
                  onChange={(e) => set('market_summary')(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="products_summary">Tóm tắt sản phẩm / dịch vụ</Label>
                <Textarea
                  id="products_summary"
                  rows={3}
                  value={form.products_summary}
                  onChange={(e) => set('products_summary')(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ['Tên pháp lý', company.legal_name],
                  ['Mã quốc gia', company.country_code],
                  ['Website', company.website],
                  ['Ngành nghề', company.industry],
                  ['Quy mô nhân sự', company.employee_size_range],
                  ['Năm thành lập', company.founded_year],
                  ['Mã số thuế / ĐKKD', company.tax_or_registration_id],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm">{value || '—'}</dd>
                  </div>
                ))}
              </dl>
              <dl className="mt-4 space-y-4">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tóm tắt thị trường
                  </dt>
                  <dd className="mt-1 whitespace-pre-line text-sm">
                    {company.market_summary || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Tóm tắt sản phẩm / dịch vụ
                  </dt>
                  <dd className="mt-1 whitespace-pre-line text-sm">
                    {company.products_summary || '—'}
                  </dd>
                </div>
              </dl>
            </>
          )}
          <p className="mt-4 text-[11px] text-muted-foreground">
            Tạo {formatDateTime(company.created_at)} · Cập nhật{' '}
            {formatDateTime(company.updated_at)}
          </p>
        </CardContent>
      </Card>

      {/* Dialog QR chia sẻ — chỉ encode link công khai của trang chia sẻ */}
      <Dialog
        open={qrOpen}
        onOpenChange={(open) => {
          setQrOpen(open);
          if (!open) setQrData(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>QR chia sẻ công ty</DialogTitle>
            <DialogDescription>
              Quét mã để mở trang chia sẻ công khai của {company.display_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {qrBusy ? (
              <div className="flex h-56 items-center justify-center">
                <Spinner />
              </div>
            ) : qrError ? (
              <p className="text-sm text-destructive">{qrError}</p>
            ) : (
              qrData && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrData}
                  alt="Mã QR dẫn tới trang chia sẻ công ty"
                  className="h-56 w-56 rounded-lg border"
                />
              )
            )}
            <div className="flex w-full items-center gap-2">
              <Input readOnly value={qrUrl} onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={() => void copyQrUrl()}>
                {qrCopied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {qrCopied ? 'Đã sao chép' : 'Copy'}
              </Button>
            </div>
          </div>
          <DialogFooter>
            {qrData && (
              <a
                href={qrData}
                download="qr-chia-se-cong-ty.png"
                className={buttonVariants({ variant: 'outline' })}
              >
                Tải PNG
              </a>
            )}
            <Button variant="outline" onClick={() => setQrOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
