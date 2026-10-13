import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { ContactDetail } from '../../../../features/contacts/contact-detail';

type PageProps = { params: Promise<{ id: string }> };

// Trang theo id động: render mới trên mỗi request, không prerender.
export const instant = false;

/**
 * Trang chi tiết liên hệ: xem, sửa, xem nguồn gốc dữ liệu, lưu trữ/xóa.
 */
export default async function ContactDetailPage({ params }: PageProps) {
  await requireUserInServerComponent();
  const { id } = await params;

  return (
    <>
      <PageHeader
        title="Chi tiết liên hệ"
        description={
          <Link
            href="/home/danh-ba"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Về danh bạ
          </Link>
        }
      />

      <PageBody>
        <div className="mx-auto w-full max-w-3xl">
          <ContactDetail contactId={id} />
        </div>
      </PageBody>
    </>
  );
}
