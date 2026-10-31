import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { CompanyDetail } from '../../../../features/companies/company-detail';

type PageProps = { params: Promise<{ id: string }> };

// Trang theo id động: render mới trên mỗi request, không prerender.
export const instant = false;

/**
 * Trang chi tiết công ty: xem / sửa hồ sơ công ty, xác minh thông tin,
 * link trang chia sẻ công khai.
 */
export default async function CompanyDetailPage({ params }: PageProps) {
  await requireUserInServerComponent();
  const { id } = await params;

  return (
    <>
      <PageHeader
        title="Chi tiết công ty"
        description={
          <Link
            href="/dashboard/cong-ty"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Về danh sách công ty
          </Link>
        }
      />

      <PageBody>
        <div className="mx-auto w-full max-w-3xl">
          <CompanyDetail companyId={id} />
        </div>
      </PageBody>
    </>
  );
}
