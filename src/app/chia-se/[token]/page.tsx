import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Trang công khai, không yêu cầu đăng nhập.
// Trang chờ params động ([token]) nên luôn render theo request.
// Đọc qua service-role phía server — không thêm RLS policy public để tránh
// bị enumerate toàn bộ bảng companies.
export const instant = false;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompanyProfile = {
  display_name: string;
  website: string | null;
  industry: string | null;
  country_code: string | null;
  founded_year: number | null;
  market_summary: string | null;
  products_summary: string | null;
  profile_state: string | null;
};

type PublicContact = {
  full_name: string;
  job_title: string | null;
};

async function loadCompanyProfile(token: string) {
  if (!UUID_PATTERN.test(token)) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  const { data: company, error } = await admin
    .from("companies")
    .select(
      "id, organization_id, display_name, website, industry, country_code, founded_year, market_summary, products_summary, profile_state",
    )
    .eq("share_token", token)
    .maybeSingle();

  if (error || !company) return null;

  // Chỉ lấy tên + chức danh — tuyệt đối không lấy email/SĐT lên trang công khai.
  const { data: contacts } = await admin
    .from("contacts")
    .select("full_name, job_title")
    .eq("organization_id", company.organization_id)
    .eq("company_id", company.id)
    .is("archived_at", null)
    .order("full_name");

  return {
    company: company as CompanyProfile,
    contacts: (contacts ?? []) as PublicContact[],
  };
}

type PageProps = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const profile = await loadCompanyProfile(token);
  return {
    title: profile ? profile.company.display_name : "Không tìm thấy công ty",
  };
}

export default async function CompanySharePage({ params }: PageProps) {
  const { token } = await params;
  const profile = await loadCompanyProfile(token);
  if (!profile) notFound();

  const { company, contacts } = profile;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-indigo-600">
        Hồ sơ công ty
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
        {company.display_name}
      </h1>

      <dl className="mt-8 grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2">
        {company.industry && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Lĩnh vực
            </dt>
            <dd className="mt-1 text-sm text-slate-900">{company.industry}</dd>
          </div>
        )}
        {company.website && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Website
            </dt>
            <dd className="mt-1 text-sm">
              <a
                href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 underline hover:text-indigo-800"
              >
                {company.website}
              </a>
            </dd>
          </div>
        )}
        {company.country_code && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Quốc gia
            </dt>
            <dd className="mt-1 text-sm text-slate-900">{company.country_code}</dd>
          </div>
        )}
        {company.founded_year && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Năm thành lập
            </dt>
            <dd className="mt-1 text-sm text-slate-900">{company.founded_year}</dd>
          </div>
        )}
      </dl>

      {company.market_summary && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Tổng quan thị trường</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{company.market_summary}</p>
        </section>
      )}

      {company.products_summary && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Sản phẩm / Dịch vụ</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{company.products_summary}</p>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Người liên hệ</h2>
        {contacts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Chưa có thông tin liên hệ công khai.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {contacts.map((contact, index) => (
              <li key={`${contact.full_name}-${index}`} className="py-2">
                <p className="text-sm font-medium text-slate-900">{contact.full_name}</p>
                {contact.job_title && (
                  <p className="text-xs text-slate-500">{contact.job_title}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-slate-400">
        Thông tin do người lưu danh thiếp cung cấp — chưa được xác minh độc lập.
      </p>
    </main>
  );
}
