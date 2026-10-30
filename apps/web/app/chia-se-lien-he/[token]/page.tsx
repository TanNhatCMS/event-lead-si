import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getSupabaseServerAdminClient } from '@kit/supabase/server-admin-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';

// Trang công khai chia sẻ MỘT liên hệ theo token (contacts.share_token),
// không yêu cầu đăng nhập — proxy.ts chỉ ép auth cho /auth/* và /dashboard/*.
// Đọc qua service-role phía server, không thêm RLS public để tránh bị
// enumerate toàn bảng contacts.
//
// CHỈ hiển thị: họ tên, chức danh, công ty. Tuyệt đối không render email,
// SĐT, địa chỉ hay ghi chú lên trang công khai.
//
// Route công khai theo token: render mới trên mỗi request (không prerender),
// vì dữ liệu đọc qua service-role theo token trên URL. Kit này bật
// cacheComponents nên dùng `instant` thay vì `dynamic` ở route segment config.
export const instant = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = { params: Promise<{ token: string }> };

async function loadSharedContact(token: string) {
  if (!UUID_PATTERN.test(token)) return null;
  const admin = getSupabaseServerAdminClient();

  const { data: contact, error } = await admin
    .from('contacts')
    .select(
      'id, full_name, job_title, company_id, companies(display_name)',
    )
    .eq('share_token', token)
    .maybeSingle();

  if (error || !contact) return null;
  const company = contact.companies as unknown as
    | { display_name: string }
    | null;

  return {
    fullName: contact.full_name,
    jobTitle: contact.job_title,
    companyName: company?.display_name ?? null,
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const contact = await loadSharedContact(token);
  return {
    title: contact ? contact.fullName : 'Không tìm thấy liên hệ',
  };
}

export default async function ContactSharePage({ params }: PageProps) {
  const { token } = await params;
  const contact = await loadSharedContact(token);
  if (!contact) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardDescription>Hồ sơ liên hệ công khai</CardDescription>
          <CardTitle className="text-3xl">{contact.fullName}</CardTitle>
          {contact.jobTitle && (
            <p className="text-sm text-muted-foreground">{contact.jobTitle}</p>
          )}
        </CardHeader>
        <CardContent>
          {contact.companyName ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Công ty
              </dt>
              <dd className="mt-1 text-sm">{contact.companyName}</dd>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Chưa có thông tin công ty.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Thông tin do người lưu danh thiếp cung cấp — chưa được xác minh độc lập.
      </p>
    </main>
  );
}
