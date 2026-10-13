import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { PageBody, PageHeader } from '@kit/ui/page';

import { requireUserInServerComponent } from '~/lib/server/require-user-in-server-component';

// Lưu ý: tsconfig map `~/*` -> `./app/*` nên `~/features/...` không resolve;
// features nằm ở apps/web/features -> dùng import tương đối.
import { SourcingDetail } from '../../../../features/sourcing/sourcing-detail';

type PageProps = { params: Promise<{ id: string }> };

// Trang theo id động: render mới trên mỗi request, không prerender.
export const instant = false;

/**
 * Chi tiết yêu cầu sourcing: tiêu chí, ứng viên, AI gợi ý và soạn RFQ.
 */
export default async function SourcingDetailPage({ params }: PageProps) {
  await requireUserInServerComponent();
  const { id } = await params;

  return (
    <>
      <PageHeader
        title="Chi tiết sourcing"
        description={
          <Link
            href="/home/sourcing"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Về danh sách sourcing
          </Link>
        }
      />

      <PageBody>
        <div className="mx-auto w-full max-w-4xl">
          <SourcingDetail requestId={id} />
        </div>
      </PageBody>
    </>
  );
}
