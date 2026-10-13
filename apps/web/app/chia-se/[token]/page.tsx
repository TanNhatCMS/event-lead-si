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

// Trang công khai, không yêu cầu đăng nhập.
// proxy.ts chỉ ép auth cho /auth/* và /home/* nên /chia-se/* mở được.
// Đọc qua service-role phía server — không thêm RLS policy public để tránh
// bị enumerate toàn bộ bảng companies.
//
// Route công khai theo token: render mới trên mỗi request (không prerender),
// vì dữ liệu đọc qua service-role theo token trên URL. Kit này bật
// cacheComponents nên dùng `instant` thay vì `dynamic` ở route segment config.
export const instant = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompanyProfile = {
  id: string;
  display_name: string;
  legal_name: string | null;
  website: string | null;
  industry: string | null;
  market_summary: string | null;
  employee_size_range: string | null;
  founded_year: number | null;
  products_summary: string | null;
};

type PublicContact = {
  id: string;
  full_name: string;
  job_title: string | null;
};

function getAdminClient() {
  return getSupabaseServerAdminClient();
}

async function loadCompanyProfile(token: string) {
  if (!UUID_PATTERN.test(token)) return null;
  const admin = getAdminClient();

  const { data: company, error } = await admin
    .from('companies')
    .select(
      'id, display_name, legal_name, website, industry, market_summary, employee_size_range, founded_year, products_summary',
    )
    .eq('share_token', token)
    .maybeSingle();

  if (error || !company) return null;

  // Chỉ lấy tên + chức danh — tuyệt đối không lấy email/SĐT lên trang công khai.
  const { data: contacts } = await admin
    .from('contacts')
    .select('id, full_name, job_title')
    .eq('company_id', company.id)
    .is('archived_at', null)
    .order('full_name');

  return {
    company: company as CompanyProfile,
    contacts: (contacts ?? []) as PublicContact[],
  };
}

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const profile = await loadCompanyProfile(token);
  return {
    title: profile ? profile.company.display_name : 'Không tìm thấy công ty',
  };
}

export default async function CompanySharePage({ params }: PageProps) {
  const { token } = await params;
  const profile = await loadCompanyProfile(token);
  if (!profile) notFound();

  const { company, contacts } = profile;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardDescription>Hồ sơ công ty</CardDescription>
          <CardTitle className="text-3xl">{company.display_name}</CardTitle>
          {company.legal_name && company.legal_name !== company.display_name && (
            <p className="text-sm text-muted-foreground">
              {company.legal_name}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {company.industry && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Lĩnh vực
                </dt>
                <dd className="mt-1 text-sm">{company.industry}</dd>
              </div>
            )}
            {company.website && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Website
                </dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={
                      company.website.startsWith('http')
                        ? company.website
                        : `https://${company.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline hover:opacity-80"
                  >
                    {company.website}
                  </a>
                </dd>
              </div>
            )}
            {company.employee_size_range && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Quy mô
                </dt>
                <dd className="mt-1 text-sm">
                  {company.employee_size_range}
                </dd>
              </div>
            )}
            {company.founded_year && (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Năm thành lập
                </dt>
                <dd className="mt-1 text-sm">{company.founded_year}</dd>
              </div>
            )}
          </dl>

          {company.market_summary && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold">Tổng quan thị trường</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {company.market_summary}
              </p>
            </div>
          )}

          {company.products_summary && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold">Sản phẩm / Dịch vụ</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {company.products_summary}
              </p>
            </div>
          )}

          <div className="mt-6">
            <h2 className="text-sm font-semibold">Người liên hệ</h2>
            {contacts.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Chưa có thông tin liên hệ công khai.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {contacts.map((contact) => (
                  <li key={contact.id} className="py-2">
                    <p className="text-sm font-medium">{contact.full_name}</p>
                    {contact.job_title && (
                      <p className="text-xs text-muted-foreground">
                        {contact.job_title}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Thông tin do người lưu danh thiếp cung cấp — chưa được xác minh độc lập.
      </p>
    </main>
  );
}
